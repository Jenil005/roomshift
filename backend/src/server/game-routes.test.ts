import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { GameResult, JoinData, ScanData } from '@shared/events'
import type { AppContext, Env } from '../../worker.js'
import { reduce, type EngineCommand, type GameState } from '../game/engine'
import { registerGameRoutes } from './game-routes'

/**
 * API compatibility: the real POST /api/game route (schema validation, token hashing,
 * command mapping) in front of the real engine. The GameRoom Durable Object is replaced by
 * an in-memory stand-in that does what GameRoom.run does: reduce, then store the state.
 *
 * It pins the request schema the current frontend needs (puzzle1:scan, puzzle1:restart) and
 * refuses the old simultaneous-hold evidence, so a backend built from an older schema fails
 * here. Use backend/tests/sim/api-compat.mjs to check a DEPLOYED backend the same way.
 */
function server() {
  const rooms = new Map<string, GameState>()
  let now = 1_000_000
  const GAME_ROOMS = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (_url: string, init: { body: string }) => {
        const out = reduce(rooms.get(id) ?? null, JSON.parse(init.body) as EngineCommand, { now, random: () => 0.42 })
        if (out.state) rooms.set(id, out.state)
        else rooms.delete(id)
        return Response.json(out.result)
      },
    }),
  }
  const app = new Hono<AppContext>()
  registerGameRoutes(app)
  const env = { GAME_ROOMS } as unknown as Env
  const post = async <T = unknown>(body: unknown) => {
    const res = await app.request('/api/game', { method: 'POST', body: JSON.stringify(body) }, env)
    return { status: res.status, body: (await res.json()) as GameResult<T> }
  }
  return { post, rooms, advance: (ms: number) => (now += ms) }
}

async function puzzle1Room() {
  const s = server()
  const host = await s.post<JoinData>({ type: 'room:create', playerName: 'Ana' })
  if (!host.body.ok) throw new Error('create failed')
  const { code, playerToken: hostToken } = host.body.data
  const guest = await s.post<JoinData>({ type: 'room:join', code, playerName: 'Ben' })
  if (!guest.body.ok) throw new Error('join failed')
  const token = guest.body.data.playerToken
  for (const t of [hostToken, token]) await s.post({ type: 'room:ready', code, playerToken: t, ready: true })
  await s.post({ type: 'game:start', code, playerToken: hostToken })
  await s.post({ type: 'intro:skip', code, playerToken: hostToken })
  const scan = (object: string, extra: Record<string, unknown> = {}) =>
    s.post<ScanData>({ type: 'puzzle1:scan', code, playerToken: token, scan: { object, source: 'ai', confidence: 0.8 }, ...extra })
  return { ...s, code, token, hostToken, scan }
}

describe('POST /api/game schema compatibility (puzzle 1 sequential scans)', () => {
  it('accepts puzzle1:scan and puzzle1:restart (the old schema answered "Invalid discriminator value")', async () => {
    const g = await puzzle1Room()
    const res = await g.scan('book')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, data: { status: 'accepted', object: 'book' } })
    const restart = await g.post({ type: 'puzzle1:restart', code: g.code, playerToken: g.token })
    expect(restart).toMatchObject({ status: 200, body: { ok: true } })
  })

  it('stores each accepted scan in the room state and returns it in the view', async () => {
    const g = await puzzle1Room()
    for (const object of ['book', 'cup']) {
      const res = await g.scan(object)
      expect(res.body).toMatchObject({ ok: true, data: { status: 'accepted', object } })
      expect(g.rooms.get(g.code)!.puzzle1!.scans.map((s) => s.object)).toContain(object) // persisted
    }
    const last = await g.scan('keyboard')
    expect(last.body).toMatchObject({ ok: true, data: { status: 'solved' } })
    const view = await g.post<{ room: { puzzle1: { scanned: { object: string }[] }; systems: { breaker: boolean } } }>({
      type: 'player:heartbeat',
      code: g.code,
      playerToken: g.hostToken,
    })
    expect(view.body.ok && view.body.data.room.puzzle1.scanned.map((s) => s.object)).toEqual(['book', 'cup', 'keyboard'])
    expect(view.body.ok && view.body.data.room.systems.breaker).toBe(true)
  })

  it('a reload (rejoin with the stored token) recovers progress, and a re-sent scan is a duplicate', async () => {
    const g = await puzzle1Room()
    await g.scan('book')
    const rejoin = await g.post<JoinData>({ type: 'room:join', code: g.code.toLowerCase(), playerName: 'Ben', playerToken: g.token })
    expect(rejoin.body).toMatchObject({ ok: true, data: { playerToken: g.token, room: { puzzle1: { scanned: [{ object: 'book' }] } } } })
    expect((await g.scan('book')).body).toMatchObject({ ok: true, data: { status: 'duplicate' } })
    expect(g.rooms.get(g.code)!.puzzle1!.scans).toHaveLength(1)
  })

  it('takes identity from the token only: client-sent ids are ignored, a bad token is refused', async () => {
    const g = await puzzle1Room()
    const res = await g.scan('book', { playerId: 'someone-else' })
    expect(res.body.ok).toBe(true)
    expect(g.rooms.get(g.code)!.puzzle1!.scans[0].by).not.toBe('someone-else')
    const forged = await g.post({ type: 'puzzle1:scan', code: g.code, playerToken: 'x'.repeat(32), scan: { object: 'cup', source: 'ai', confidence: 0.9 } })
    expect(forged).toMatchObject({ status: 401, body: { ok: false, code: 'not_in_room' } })
  })

  it('validates the scan body at the route', async () => {
    const g = await puzzle1Room()
    const bad = [
      { object: 'book', source: 'laser', confidence: 0.9 },
      { object: 'book', source: 'ai', confidence: 2 },
      { object: 'x'.repeat(40), source: 'qr' },
      { source: 'qr' },
    ]
    for (const scan of bad) {
      const res = await g.post({ type: 'puzzle1:scan', code: g.code, playerToken: g.token, scan })
      expect(res).toMatchObject({ status: 400, body: { ok: false, code: 'bad_request' } })
    }
    expect(g.rooms.get(g.code)!.puzzle1!.scans).toHaveLength(0)
  })

  it('refuses the old simultaneous-hold evidence and the old scanned list', async () => {
    const g = await puzzle1Room()
    const legacy = [
      { puzzle: 1, physical: { source: 'camera', markers: [], heldForMs: 1300 } },
      { puzzle: 1, scanned: ['book', 'cup', 'keyboard'] },
    ]
    for (const submission of legacy) {
      const res = await g.post({ type: 'puzzle:submit', code: g.code, playerToken: g.token, submission })
      expect(res.status === 400 || (res.body.ok === false && res.body.code === 'bad_request')).toBe(true)
    }
    expect(g.rooms.get(g.code)!.puzzles[1].solved).toBe(false)
  })
})
