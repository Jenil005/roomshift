#!/usr/bin/env node
/**
 * Scripted multiplayer check against a running backend (local or deployed).
 *
 *   node tests/sim/playthrough.mjs                      # http://localhost:5173
 *   node tests/sim/playthrough.mjs https://roomshift.app.space
 *
 * Plays the Phase 2 loop with simulated players over POST /api/game, and watches the
 * public `rs_rooms` record through an ANONYMOUS DeepSpace socket (what a judge's phone
 * sees) to prove the server's state reaches clients live. Exits 1 on any failure.
 */

import fs from 'node:fs'

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
const APP_ID = fs.readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8').match(/DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/)[1]
const INTRO_MS = 8000

let failures = 0
const check = (cond, label, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ''}`)
  if (!cond) failures++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(body) {
  const res = await fetch(`${BASE}/api/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const json = await res.json()
  return { status: res.status, ...json }
}

/** Anonymous live view of one room, via the same socket protocol useQuery uses. */
function watchRoom(code) {
  const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws/${encodeURIComponent(`app:${APP_ID}`)}`
  const ws = new WebSocket(wsUrl)
  const watcher = { latest: null, ws, ready: null }
  const take = (record) => {
    if (record?.data?.code === code) watcher.latest = record.data.view
  }
  watcher.ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'core.subscribe', payload: { subscriptionId: 'sim', query: { collection: 'rs_rooms', where: { code } } } }))
    })
    ws.addEventListener('message', (ev) => {
      let msg
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
      } catch {
        return
      }
      if (msg.type === 'core.query_result') {
        for (const r of msg.payload?.records ?? []) take(r)
        resolve()
      } else if (msg.type === 'core.record_change') {
        if (msg.payload?.changeType === 'delete') watcher.latest = 'deleted'
        else take(msg.payload?.record)
      } else if (msg.type === 'core.error') {
        console.log('socket error message:', JSON.stringify(msg.payload))
      }
    })
    ws.addEventListener('error', () => reject(new Error(`WebSocket failed: ${wsUrl}`)))
  })
  return watcher
}

async function waitFor(fn, label, ms = 5000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await sleep(100)
  }
  check(false, label)
  return false
}

async function main() {
  console.log(`Backend: ${BASE}  app: ${APP_ID}\n`)

  // --- create / join ---
  const a = await api({ type: 'room:create', playerName: 'Ada' })
  check(a.ok && /^[A-Z]{4}$/.test(a.data.code) && a.data.playerToken, 'host creates a room', a)
  const code = a.data.code
  const tokA = a.data.playerToken

  const live = watchRoom(code)
  await live.ready
  check(live.latest?.phase === 'LOBBY', 'anonymous socket sees the new room in LOBBY', live.latest)

  const b = await api({ type: 'room:join', code: code.toLowerCase(), playerName: 'Bea' })
  check(b.ok && b.data.playerId !== a.data.playerId, 'second player joins (lowercase code accepted)', b)
  const tokB = b.data.playerToken
  await waitFor(() => live.latest?.players?.length === 2, 'live view shows 2 players')

  // --- failure paths before start ---
  check((await api({ type: 'room:join', code: 'ZZZZ', playerName: 'X' })).code === 'room_not_found', 'unknown code -> room_not_found')
  check((await api({ type: 'room:join', code, playerName: 'ada' })).code === 'name_taken', 'duplicate name -> name_taken')
  check((await api({ type: 'room:ready', code, playerToken: 'x'.repeat(32), ready: true })).code === 'not_in_room', 'bad token -> not_in_room')
  const bad = await api('{"type":"room:ready"')
  check(bad.status === 400 && bad.code === 'bad_request', 'malformed JSON -> 400 bad_request', bad)
  check((await api({ type: 'game:start', code, playerToken: tokA })).code === 'wrong_phase', 'start before everyone is ready -> wrong_phase')

  // --- ready flow ---
  await api({ type: 'room:ready', code, playerToken: tokA, ready: true })
  const r = await api({ type: 'room:ready', code, playerToken: tokB, ready: true })
  check(r.ok && r.data.room.phase === 'READY', 'all ready -> READY', r)
  await waitFor(() => live.latest?.phase === 'READY', 'live view shows READY')

  // --- start ---
  check((await api({ type: 'game:start', code, playerToken: tokB })).code === 'not_host', 'non-host start -> not_host')
  const s = await api({ type: 'game:start', code, playerToken: tokA })
  check(s.ok && s.data.room.phase === 'INTRO', 'host starts -> INTRO', s)
  const startedAt = Date.now()
  check((await api({ type: 'game:start', code, playerToken: tokA })).code === 'wrong_phase', 'duplicate start -> wrong_phase')
  check((await api({ type: 'room:join', code, playerName: 'Late' })).code === 'game_started', 'join after start -> game_started')

  // --- roles and private clues ---
  const meA = await api({ type: 'room:me', code, playerToken: tokA })
  const meB = await api({ type: 'room:me', code, playerToken: tokB })
  check(meA.ok && meB.ok && meA.data.clue && meB.data.clue, 'both players get a private clue', [meA, meB])
  check(meA.data.clue.role !== meB.data.clue.role, 'roles differ', [meA.data.clue.role, meB.data.clue.role])
  check(!meA.data.clue.clues.some((c) => meB.data.clue.clues.includes(c)), 'clues differ')
  await waitFor(() => live.latest?.phase === 'INTRO', 'live view shows INTRO')
  const publicJson = JSON.stringify(live.latest)
  check(![...meA.data.clue.clues, ...meB.data.clue.clues].some((c) => publicJson.includes(c)), 'public view contains no private clue')
  check(!publicJson.includes(tokA) && !publicJson.includes(tokB), 'public view contains no token')

  // --- reconnect (phone refresh / sleep) ---
  const re = await api({ type: 'room:join', code, playerName: 'Bea', playerToken: tokB })
  check(re.ok && re.data.playerId === b.data.playerId && re.data.playerToken === tokB, 'rejoin with token restores the same player', re)

  // --- intro auto-advance by server alarm (no requests during the wait) ---
  await sleep(Math.max(0, INTRO_MS - (Date.now() - startedAt)))
  await waitFor(() => live.latest?.phase === 'PUZZLE_1', 'server alarm advances INTRO -> PUZZLE_1 with no client requests', 6000)
  check(live.latest?.phase === 'PUZZLE_1', 'live view shows PUZZLE_1')
  check((await api({ type: 'puzzle:submit', code, playerToken: tokA, submission: { puzzle: 1, scanned: ['book', 'cup', 'keys'] } })).code === 'not_implemented', 'puzzle:submit reserved for next phase')

  // --- full room + leave cleanup (second room) ---
  const h = await api({ type: 'room:create', playerName: 'H' })
  const tokens = [h.data.playerToken]
  for (const n of ['P1', 'P2', 'P3']) tokens.push((await api({ type: 'room:join', code: h.data.code, playerName: n })).data.playerToken)
  check((await api({ type: 'room:join', code: h.data.code, playerName: 'P4' })).code === 'room_full', '5th player -> room_full')
  const live2 = watchRoom(h.data.code)
  await live2.ready
  for (const t of tokens) await api({ type: 'room:leave', code: h.data.code, playerToken: t })
  await waitFor(() => live2.latest === 'deleted' || live2.latest === null, 'empty room is deleted from the live view')
  check((await api({ type: 'room:join', code: h.data.code, playerName: 'Z' })).code === 'room_not_found', 'deleted room -> room_not_found')

  live.ws.close()
  live2.ws.close()
  console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
