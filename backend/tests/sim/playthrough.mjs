#!/usr/bin/env node
/**
 * Scripted multiplayer check against a running backend (local or deployed).
 *
 *   node tests/sim/playthrough.mjs                      # http://localhost:5173
 *   node tests/sim/playthrough.mjs https://roomshift.app.space
 *
 * Plays a full digital game (LOBBY -> COMPLETE -> reset) plus failure paths with simulated
 * players over POST /api/game, and watches the
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
  watcher.narration = new Map() // phase -> { text, source } (last seen)
  const take = (record) => {
    if (record?.data?.code !== code) return
    watcher.latest = record.data.view
    const v = watcher.latest
    if (v?.narration) watcher.narration.set(v.phase, { text: v.narration, source: v.narrationSource })
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

// Parses the clue sentences from shared/puzzles/commsBoot.ts describe() and returns
// every module order consistent with all of them (what players work out by talking).
function solveFromClues(lines) {
  const id = (label) => label.toLowerCase()
  const tests = lines.map((line) => {
    let m
    if ((m = line.match(/^(\w+) must come online before (\w+)\.$/))) return (o) => o.indexOf(id(m[1])) < o.indexOf(id(m[2]))
    if ((m = line.match(/^(\w+) cannot be the first module to boot\.$/))) return (o) => o[0] !== id(m[1])
    if ((m = line.match(/^(\w+) is never the last module to boot\.$/))) return (o) => o[3] !== id(m[1])
    throw new Error(`Unrecognized clue: ${line}`)
  })
  const perms = (rest) => (rest.length ? rest.flatMap((m, i) => perms([...rest.slice(0, i), ...rest.slice(i + 1)]).map((p) => [m, ...p])) : [[]])
  return perms(['auth', 'network', 'database', 'uplink']).filter((o) => tests.every((t) => t(o)))
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

  // --- puzzle 1: physical order (fake AR submissions) ---
  const p1 = (submission) => api({ type: 'puzzle:submit', code, playerToken: tokB, submission: { puzzle: 1, ...submission } })
  check((await p1({ scanned: ['book', 'phone', 'keys'] })).code === 'bad_request', 'unknown object id -> bad_request')
  const wrong1 = await p1({ scanned: ['keys', 'cup', 'book'] })
  check(wrong1.ok && wrong1.data.solved === false && wrong1.data.reason === 'Wrong order', 'wrong scan order -> solved:false', wrong1)
  await sleep(1100) // puzzle 1 cooldown after a wrong attempt
  // Exactly what ar/physicalOrder.ts toCameraResult() produces, extra fields included.
  const arResult = (xs, heldForMs = 1300) => {
    const markers = ['BOOK', 'CUP', 'KEYS'].map((id, i) => ({
      id,
      center: { x: xs[i], y: 0.5 },
      corners: [0, 1, 2, 3].map(() => ({ x: xs[i], y: 0.5 })),
    }))
    return { solved: true, markers, detectedIds: markers.map((m) => m.id), order: ['BOOK', 'CUP', 'KEYS'], source: 'camera', heldForMs }
  }
  const lie = await p1({ physical: arResult([0.8, 0.5, 0.2]) })
  check(lie.ok && lie.data.solved === false && lie.data.reason === 'Wrong order', 'AR result claiming solved, markers out of order -> rejected', lie)
  const tooSoon = await p1({ physical: arResult([0.2, 0.5, 0.8]) })
  check(tooSoon.code === 'cooldown' && tooSoon.status === 429, 'retry inside the 1 s puzzle 1 cooldown -> cooldown', tooSoon)
  await sleep(1100)
  const shaky = await p1({ physical: arResult([0.2, 0.5, 0.8], 400) })
  check(shaky.ok && shaky.data.reason === 'Hold the objects steady', 'AR result held too briefly -> rejected', shaky)
  await sleep(1100)
  const ok1 = await p1({ physical: arResult([0.2, 0.5, 0.8]) })
  check(ok1.ok && ok1.data.solved && ok1.data.room.systems.breaker, 'AR camera evidence -> breaker online', ok1)
  check(ok1.data?.room.puzzles[1].verifiedBy === 'camera', 'puzzle 1 recorded as verified by camera')
  const polled = await fetch(`${BASE}/api/game/room/${code.toLowerCase()}`).then((r) => r.json())
  check(polled.ok && polled.data.room.systems.breaker === true, 'GET /api/game/room/:code shows breaker online', polled)
  check(!JSON.stringify(polled).includes(tokA), 'polled view contains no token')
  check((await p1({ scanned: ['book', 'cup', 'keys'] })).code === 'wrong_phase', 'duplicate puzzle 1 submit -> wrong_phase')
  await waitFor(() => live.latest?.phase === 'PUZZLE_2', 'server auto-advances to PUZZLE_2', 8000)
  check(live.latest?.phase === 'PUZZLE_2', 'live view shows PUZZLE_2')

  // --- puzzle 2: players pool their private clues and deduce the order ---
  const clues = []
  for (const t of [tokA, tokB]) clues.push(...(await api({ type: 'room:me', code, playerToken: t })).data.clue.clues)
  check(clues.length === 5, 'puzzle 2 deals 5 clues across the team', clues)
  const p2Json = JSON.stringify(live.latest)
  check(!clues.some((c) => p2Json.includes(c)), 'public view contains no puzzle 2 clue')
  const solution = solveFromClues(clues)
  check(solution.length === 1, 'pooled clues leave exactly one boot order', solution)

  await api({ type: 'puzzle2:draft', code, playerToken: tokA, order: ['auth', 'nope', 'auth'] })
  await waitFor(() => JSON.stringify(live.latest?.puzzle2?.draft) === '["auth"]', 'shared draft syncs live (validated)')
  const p2 = (order, t = tokA) => api({ type: 'puzzle:submit', code, playerToken: t, submission: { puzzle: 2, order } })
  const wrong2 = await p2([...solution[0]].reverse())
  check(wrong2.ok && wrong2.data.solved === false && wrong2.data.retryAfterMs === 3000, 'wrong boot order -> 3 s cooldown', wrong2)
  const cool = await p2(solution[0], tokB)
  check(cool.code === 'cooldown' && cool.retryAfterMs > 0 && cool.status === 429, 'submit during cooldown -> 429 cooldown', cool)
  await sleep(3100)
  const ok2 = await p2(solution[0], tokB)
  check(ok2.ok && ok2.data.solved && ok2.data.room.systems.terminal, 'correct boot order -> terminal online', ok2)
  await waitFor(() => live.latest?.phase === 'FINAL_SEQUENCE', 'server auto-advances to FINAL_SEQUENCE', 8000)

  // --- final sequence: everyone holds together ---
  const press = (t, held) => api({ type: 'final:press', code, playerToken: t, held })
  check((await api({ type: 'final:force', code, playerToken: tokA })).code === 'cooldown', 'early host force -> cooldown')
  await press(tokA, true)
  await waitFor(() => live.latest?.final?.holding?.length === 1, 'live view shows one player holding')
  check(live.latest?.phase === 'FINAL_SEQUENCE', 'one player holding is not enough')
  await press(tokB, true)
  await waitFor(() => live.latest?.phase === 'COMPLETE', 'both holding -> COMPLETE on the live view')
  check(live.latest?.systems?.door === true && live.latest?.events?.some((e) => e.type === 'game:complete'), 'door online and game:complete recorded', live.latest)

  // --- narration: every phase shows a line; Gemini replaces the fallback when configured ---
  const phasesPlayed = ['LOBBY', 'READY', 'INTRO', 'PUZZLE_1', 'PUZZLE_1_COMPLETE', 'PUZZLE_2', 'PUZZLE_2_COMPLETE', 'FINAL_SEQUENCE', 'COMPLETE']
  await sleep(3000) // give a Gemini reply for COMPLETE time to land
  const missing = phasesPlayed.filter((p) => !live.narration.get(p)?.text)
  check(missing.length === 0, 'every phase showed a narration line', missing)
  const sources = [...live.narration].map(([p, n]) => `${p}:${n.source}`)
  console.log(`      narration sources -> ${sources.join(' ')}`)
  if (process.env.EXPECT_GEMINI) check(sources.some((s) => s.endsWith(':gemini')), 'at least one phase narrated by Gemini', sources)

  // --- demo reset ---
  check((await api({ type: 'game:reset', code, playerToken: tokB })).code === 'not_host', 'non-host reset -> not_host')
  const reset = await api({ type: 'game:reset', code, playerToken: tokA })
  check(reset.ok && reset.data.room.phase === 'LOBBY' && !reset.data.room.systems.door, 'host reset -> LOBBY, systems off', reset)
  await waitFor(() => live.latest?.phase === 'LOBBY', 'live view shows LOBBY after reset')

  // --- per-player rate limit: a burst from one phone is throttled, others are not ---
  const burst = await Promise.all(Array.from({ length: 30 }, () => api({ type: 'player:heartbeat', code, playerToken: tokB })))
  const throttled = burst.filter((r) => r.code === 'rate_limited')
  check(throttled.length > 0 && throttled.every((r) => r.status === 429 && r.retryAfterMs > 0), 'burst of 30 requests from one player -> rate_limited', burst.map((r) => r.code ?? 'ok'))
  check((await api({ type: 'player:heartbeat', code, playerToken: tokA })).ok, 'other player is not throttled by the burst')
  await sleep(4500) // let the bucket refill

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
