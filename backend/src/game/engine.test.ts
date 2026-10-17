import { describe, expect, it } from 'vitest'
import {
  DISCONNECT_AFTER_MS,
  FINAL_FORCE_AFTER_MS,
  FINAL_SYNC_WINDOW_MS,
  INTRO_DURATION_MS,
  LOBBY_DROP_AFTER_MS,
  MAX_PLAYERS,
  PHASE_COMPLETE_HOLD_MS,
  ROOM_IDLE_TTL_MS,
} from '@shared/constants'
import type { MeData, SubmitData } from '@shared/events'
import { MODULES } from '@shared/puzzles/commsBoot'
import { nextDeadline, reduce, toView, type EngineCommand, type GameState } from './engine'
import { PUZZLE1_SOLUTION } from './puzzle1'

const T0 = 1_000_000

// Tiny harness: applies commands in order and keeps the latest state.
function game() {
  let state: GameState | null = null
  let now = T0
  let n = 0
  const run = (command: EngineCommand) => {
    const out = reduce(state, command, { now, random: () => 0.42 })
    state = out.state
    return out
  }
  return {
    get state() {
      return state
    },
    advance(ms: number) {
      now += ms
    },
    run,
    create(name = 'Host') {
      return run({ type: 'room:create', code: 'ABCD', playerId: 'p0', playerName: name, tokenHash: 'h0' })
    },
    join(name: string) {
      n += 1
      return run({ type: 'room:join', playerId: `p${n}`, playerName: name, tokenHash: `h${n}` })
    },
  }
}

function lobbyOfTwo() {
  const g = game()
  g.create()
  g.join('Bea')
  return g
}

function startedGame() {
  const g = lobbyOfTwo()
  g.run({ type: 'room:ready', tokenHash: 'h0', ready: true })
  g.run({ type: 'room:ready', tokenHash: 'h1', ready: true })
  expect(g.run({ type: 'game:start', tokenHash: 'h0' }).result.ok).toBe(true)
  return g
}

describe('create and join', () => {
  it('creates a lobby with the creator as host', () => {
    const g = game()
    const { result, viewChanged } = g.create('  Ada  ')
    expect(result.ok).toBe(true)
    expect(viewChanged).toBe(true)
    expect(g.state!.phase).toBe('LOBBY')
    expect(g.state!.hostId).toBe('p0')
    expect(g.state!.players[0]).toMatchObject({ name: 'Ada', isHost: true, connected: true })
  })

  it('refuses create on a taken code', () => {
    const g = game()
    g.create()
    expect(g.create().result).toMatchObject({ ok: false, code: 'server_error' })
  })

  it('rejects unknown rooms, full rooms and duplicate names', () => {
    const g = game()
    expect(g.join('X').result).toMatchObject({ ok: false, code: 'room_not_found' })
    g.create()
    expect(g.join('host').result).toMatchObject({ ok: false, code: 'name_taken' })
    for (let i = 1; i < MAX_PLAYERS; i++) expect(g.join(`P${i}`).result.ok).toBe(true)
    expect(g.join('Extra').result).toMatchObject({ ok: false, code: 'room_full' })
  })

  it('rejects new players after the game starts but lets a player rejoin by token', () => {
    const g = startedGame()
    expect(g.join('Late').result).toMatchObject({ ok: false, code: 'game_started' })
    const rejoin = g.run({ type: 'room:join', playerId: 'new', playerName: 'Bea', tokenHash: 'fresh', rejoinTokenHash: 'h1' })
    expect(rejoin.result).toMatchObject({ ok: true, data: { playerId: 'p1', rejoined: true } })
    expect(g.state!.players).toHaveLength(2)
  })
})

describe('ready flow and start', () => {
  it('moves LOBBY -> READY only when enough players are all ready, and back', () => {
    const g = lobbyOfTwo()
    g.run({ type: 'room:ready', tokenHash: 'h0', ready: true })
    expect(g.state!.phase).toBe('LOBBY')
    g.run({ type: 'room:ready', tokenHash: 'h1', ready: true })
    expect(g.state!.phase).toBe('READY')
    g.join('Cy') // a new unready player drops the room back to LOBBY
    expect(g.state!.phase).toBe('LOBBY')
  })

  it('a lone ready host stays in LOBBY and cannot start', () => {
    const g = game()
    g.create()
    g.run({ type: 'room:ready', tokenHash: 'h0', ready: true })
    expect(g.state!.phase).toBe('LOBBY')
    expect(g.run({ type: 'game:start', tokenHash: 'h0' }).result).toMatchObject({ ok: false, code: 'not_enough_players' })
  })

  it('only the host can start, and only from READY', () => {
    const g = lobbyOfTwo()
    expect(g.run({ type: 'game:start', tokenHash: 'h0' }).result).toMatchObject({ ok: false, code: 'wrong_phase' })
    g.run({ type: 'room:ready', tokenHash: 'h0', ready: true })
    g.run({ type: 'room:ready', tokenHash: 'h1', ready: true })
    expect(g.run({ type: 'game:start', tokenHash: 'h1' }).result).toMatchObject({ ok: false, code: 'not_host' })
    expect(g.run({ type: 'game:start', tokenHash: 'h0' }).result.ok).toBe(true)
    expect(g.state!.phase).toBe('INTRO')
  })

  it('assigns distinct roles and clues exactly once; a duplicate start changes nothing', () => {
    const g = startedGame()
    const roles = g.state!.players.map((p) => p.role)
    expect(new Set(roles).size).toBe(2)
    const snapshot = JSON.stringify(g.state)
    const dup = g.run({ type: 'game:start', tokenHash: 'h0' })
    expect(dup.result).toMatchObject({ ok: false, code: 'wrong_phase' })
    expect(dup.viewChanged).toBe(false)
    expect(JSON.stringify(g.state)).toBe(snapshot)
  })

  it('rejects unknown tokens', () => {
    const g = lobbyOfTwo()
    expect(g.run({ type: 'room:ready', tokenHash: 'nope', ready: true }).result).toMatchObject({
      ok: false,
      code: 'not_in_room',
    })
  })
})

describe('private clues', () => {
  it('room:me returns only the caller clues, and the public view has none', () => {
    const g = startedGame()
    const me0 = g.run({ type: 'room:me', tokenHash: 'h0' }).result
    const me1 = g.run({ type: 'room:me', tokenHash: 'h1' }).result
    if (!me0.ok || !me1.ok) throw new Error('room:me failed')
    const a = (me0.data as MeData).clue!
    const b = (me1.data as MeData).clue!
    expect(a.playerId).toBe('p0')
    expect(a.clues.length).toBeGreaterThan(0)
    expect(b.clues.length).toBeGreaterThan(0)
    expect(a.clues.some((c) => b.clues.includes(c))).toBe(false)
    const view = JSON.stringify(toView(g.state!))
    for (const clue of [...a.clues, ...b.clues]) expect(view).not.toContain(clue)
    expect(view).not.toContain('h0')
    expect(view).not.toContain(PUZZLE1_SOLUTION.join(','))
  })

  it('room:me before the start has no clue', () => {
    const g = lobbyOfTwo()
    const me = g.run({ type: 'room:me', tokenHash: 'h1' }).result
    expect(me).toMatchObject({ ok: true, data: { clue: null } })
  })
})

describe('timers', () => {
  it('INTRO auto-advances to PUZZLE_1, and the host can skip it', () => {
    const g = startedGame()
    expect(nextDeadline(g.state)).toBe(T0 + INTRO_DURATION_MS)
    g.advance(INTRO_DURATION_MS - 1)
    g.run({ type: 'tick' })
    expect(g.state!.phase).toBe('INTRO')
    g.advance(1)
    g.run({ type: 'tick' })
    expect(g.state!.phase).toBe('PUZZLE_1')

    const s = startedGame()
    expect(s.run({ type: 'intro:skip', tokenHash: 'h1' }).result).toMatchObject({ ok: false, code: 'not_host' })
    expect(s.run({ type: 'intro:skip', tokenHash: 'h0' }).result.ok).toBe(true)
    expect(s.state!.phase).toBe('PUZZLE_1')
  })

  it('marks silent players disconnected and reconnects them on their next request', () => {
    const g = startedGame()
    g.advance(DISCONNECT_AFTER_MS - 1)
    g.run({ type: 'player:heartbeat', tokenHash: 'h0' })
    g.advance(2)
    g.run({ type: 'tick' })
    expect(g.state!.players.map((p) => p.connected)).toEqual([true, false])
    // A sleeping phone keeps its role mid-game.
    expect(g.state!.players[1].role).toBeDefined()
    g.run({ type: 'player:heartbeat', tokenHash: 'h1' })
    expect(g.state!.players[1].connected).toBe(true)
  })

  it('heartbeats alone do not change the public view', () => {
    const g = startedGame()
    g.advance(1000)
    expect(g.run({ type: 'player:heartbeat', tokenHash: 'h1' }).viewChanged).toBe(false)
  })

  it('drops long-gone lobby players and hands off host', () => {
    const g = lobbyOfTwo()
    g.advance(LOBBY_DROP_AFTER_MS)
    g.run({ type: 'player:heartbeat', tokenHash: 'h1' })
    g.advance(2)
    g.run({ type: 'tick' })
    expect(g.state!.players.map((p) => p.id)).toEqual(['p1'])
    expect(g.state!.hostId).toBe('p1')
    expect(g.state!.players[0].isHost).toBe(true)
  })

  it('deletes idle rooms', () => {
    const g = lobbyOfTwo()
    g.advance(ROOM_IDLE_TTL_MS + 1)
    expect(g.run({ type: 'tick' }).state).toBeNull()
  })
})

describe('leave', () => {
  it('removes a lobby player, hands off host, and deletes an empty room', () => {
    const g = lobbyOfTwo()
    g.run({ type: 'room:leave', tokenHash: 'h0' })
    expect(g.state!.hostId).toBe('p1')
    g.run({ type: 'room:leave', tokenHash: 'h1' })
    expect(g.state).toBeNull()
  })

  it('mid-game leave keeps the player and role', () => {
    const g = startedGame()
    g.run({ type: 'room:leave', tokenHash: 'h1' })
    expect(g.state!.players[1]).toMatchObject({ connected: false })
    expect(g.state!.players[1].role).toBeDefined()
  })
})

describe('events and versions', () => {
  it('records phase changes as ordered events and bumps version on view changes', () => {
    const g = startedGame()
    const { events, version } = toView(g.state!)
    expect(events.map((e) => e.seq)).toEqual([...events.keys()].map((i) => i + 1))
    expect(events.filter((e) => e.type === 'game:advance').map((e) => (e as { to: string }).to)).toEqual([
      'READY',
      'INTRO',
    ])
    expect(version).toBeGreaterThan(0)
  })
})

// ---- Phase 3: puzzles, final sequence, reset ----

function atPuzzle1() {
  const g = startedGame()
  g.run({ type: 'intro:skip', tokenHash: 'h0' })
  expect(g.state!.phase).toBe('PUZZLE_1')
  return g
}

const submit1 = (g: ReturnType<typeof game>, extra: { scanned?: string[]; manualCode?: string }, tokenHash = 'h1') =>
  g.run({ type: 'puzzle:submit', tokenHash, puzzle: 1, ...extra })

function atPuzzle2() {
  const g = atPuzzle1()
  submit1(g, { scanned: ['book', 'cup', 'keys'] })
  g.advance(PHASE_COMPLETE_HOLD_MS)
  g.run({ type: 'tick' })
  expect(g.state!.phase).toBe('PUZZLE_2')
  return g
}

const submit2 = (g: ReturnType<typeof game>, order: string[], tokenHash = 'h0') =>
  g.run({ type: 'puzzle:submit', tokenHash, puzzle: 2, order })

const wrongOrder = (solution: readonly string[]) => [...solution].reverse()

function atFinal() {
  const g = atPuzzle2()
  submit2(g, g.state!.puzzle2!.solution)
  g.advance(PHASE_COMPLETE_HOLD_MS)
  g.run({ type: 'tick' })
  expect(g.state!.phase).toBe('FINAL_SEQUENCE')
  return g
}

describe('puzzle 1 (physical order)', () => {
  it('only accepts submissions during PUZZLE_1', () => {
    const g = startedGame()
    expect(submit1(g, { scanned: ['book', 'cup', 'keys'] }).result).toMatchObject({ ok: false, code: 'wrong_phase' })
  })

  it('rejects malformed scans without counting an attempt', () => {
    const g = atPuzzle1()
    expect(submit1(g, { scanned: ['book', 'phone', 'keys'] }).result).toMatchObject({ ok: false, code: 'bad_request' })
    expect(submit1(g, { scanned: ['book', 'book', 'keys'] }).result).toMatchObject({ ok: false, code: 'bad_request' })
    expect(submit1(g, {}).result).toMatchObject({ ok: false, code: 'bad_request' })
    expect(g.state!.puzzles[1].attempts).toBe(0)
  })

  it('counts wrong and partial orders as failed attempts and records the event', () => {
    const g = atPuzzle1()
    const wrong = submit1(g, { scanned: ['cup', 'book', 'keys'] }).result
    expect(wrong).toMatchObject({ ok: true, data: { solved: false, reason: 'Wrong order' } })
    const partial = submit1(g, { scanned: ['book', 'cup'] }).result
    expect(partial).toMatchObject({ ok: true, data: { solved: false, reason: 'Not all objects detected' } })
    expect(submit1(g, { manualCode: 'XYZ' }).result).toMatchObject({ ok: true, data: { solved: false } })
    expect(g.state!.puzzles[1]).toMatchObject({ attempts: 3, solved: false })
    expect(g.state!.phase).toBe('PUZZLE_1')
    expect(g.state!.events.at(-1)).toMatchObject({ type: 'puzzle:failed', puzzle: 1 })
  })

  it('a correct scan sets the breaker online, completes, then auto-advances', () => {
    const g = atPuzzle1()
    const res = submit1(g, { scanned: ['book', 'cup', 'keys'] }).result
    expect(res).toMatchObject({ ok: true, data: { solved: true } })
    expect(g.state!.phase).toBe('PUZZLE_1_COMPLETE')
    expect(g.state!.systems.breaker).toBe(true)
    expect(submit1(g, { scanned: ['book', 'cup', 'keys'] }).result).toMatchObject({ ok: false, code: 'wrong_phase' })
    expect(nextDeadline(g.state)).toBe(g.state!.phaseStartedAt + PHASE_COMPLETE_HOLD_MS)
  })

  it('accepts the manual fallback code', () => {
    const g = atPuzzle1()
    expect(submit1(g, { manualCode: 'b-c-k' }).result).toMatchObject({ ok: true, data: { solved: true } })
    expect(g.state!.puzzles[1].verifiedBy).toBe('manual')
  })

  it('accepts AR camera evidence and records how it was verified', () => {
    const g = atPuzzle1()
    const physical = {
      source: 'camera' as const,
      heldForMs: 1500,
      markers: [
        { id: 'CUP', center: { x: 0.5, y: 0.5 } },
        { id: 'BOOK', center: { x: 0.2, y: 0.5 } },
        { id: 'KEYS', center: { x: 0.8, y: 0.5 } },
      ],
    }
    const res = g.run({ type: 'puzzle:submit', tokenHash: 'h1', puzzle: 1, physical }).result
    expect(res).toMatchObject({ ok: true, data: { solved: true, room: { puzzles: { 1: { verifiedBy: 'camera' } } } } })
    expect(g.state!.events.find((e) => e.type === 'puzzle:verified')).toMatchObject({ puzzle: 1, verifiedBy: 'camera' })
  })
})

describe('room:view', () => {
  it('returns the public view without auth and changes nothing', () => {
    const g = startedGame()
    const before = JSON.stringify(g.state)
    const out = g.run({ type: 'room:view' })
    expect(out.result).toMatchObject({ ok: true, data: { room: { code: 'ABCD', phase: 'INTRO' } } })
    expect(out.viewChanged).toBe(false)
    expect(JSON.stringify(g.state)).toBe(before)
    expect(JSON.stringify(out.result)).not.toContain('h0')
  })

  it('still applies timers, so a poll can observe the intro ending', () => {
    const g = startedGame()
    g.advance(INTRO_DURATION_MS)
    expect(g.run({ type: 'room:view' }).result).toMatchObject({ ok: true, data: { room: { phase: 'PUZZLE_1' } } })
  })
})

describe('puzzle 2 (comms boot)', () => {
  it('deals private comms clues, keeps the solution off the public view', () => {
    const g = atPuzzle2()
    const view = toView(g.state!)
    expect(view.puzzle2).toEqual({ draft: [], hints: [] })
    const me = g.run({ type: 'room:me', tokenHash: 'h0' }).result
    if (!me.ok) throw new Error('room:me failed')
    const lines = (me.data as MeData).clue!.clues
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => /AUTH|NETWORK|DATABASE|UPLINK/.test(l))).toBe(true)
    const json = JSON.stringify(view)
    for (const line of lines) expect(json).not.toContain(line)
    expect(json).not.toContain(String(g.state!.puzzle2!.seed))
    expect(json).not.toContain(g.state!.puzzle2!.solution.join('","'))
  })

  it('shares a validated draft', () => {
    const g = atPuzzle2()
    g.run({ type: 'puzzle2:draft', tokenHash: 'h1', order: ['uplink', 'bogus', 'auth', 'uplink', 'network', 'database'] })
    expect(toView(g.state!).puzzle2!.draft).toEqual(['uplink', 'auth', 'network', 'database'])
    const early = atPuzzle1()
    expect(early.run({ type: 'puzzle2:draft', tokenHash: 'h1', order: ['auth'] }).result).toMatchObject({
      ok: false,
      code: 'wrong_phase',
    })
  })

  it('applies 3s / 6s / 10s cooldowns and releases hints after 3 and 6 wrong tries', () => {
    const g = atPuzzle2()
    const wrong = wrongOrder(g.state!.puzzle2!.solution)
    const expectedCooldowns = [3000, 6000, 10000, 10000, 10000, 10000]
    expectedCooldowns.forEach((cooldown, i) => {
      const res = submit2(g, wrong).result
      expect(res).toMatchObject({ ok: true, data: { solved: false, reason: 'Sequence rejected', retryAfterMs: cooldown } })
      // Submitting again inside the cooldown is refused and not counted.
      g.advance(cooldown - 1)
      expect(submit2(g, wrong).result).toMatchObject({ ok: false, code: 'cooldown', retryAfterMs: 1 })
      g.advance(1)
      expect(g.state!.puzzles[2].attempts).toBe(i + 1)
      expect(toView(g.state!).puzzle2!.hints).toHaveLength(i + 1 >= 6 ? 2 : i + 1 >= 3 ? 1 : 0)
    })
    const hintEvents = g.state!.events.filter((e) => e.type === 'puzzle2:hint')
    expect(hintEvents.map((e) => (e as { text: string }).text)).toEqual([
      expect.stringMatching(/boots first\.$/),
      expect.stringMatching(/boots last\.$/),
    ])
  })

  it('rejects invalid orders without counting them', () => {
    const g = atPuzzle2()
    expect(submit2(g, ['auth', 'auth', 'network', 'uplink']).result).toMatchObject({ ok: false, code: 'bad_request' })
    expect(submit2(g, [...MODULES].slice(0, 3)).result).toMatchObject({ ok: false, code: 'bad_request' })
    expect(g.state!.puzzles[2].attempts).toBe(0)
  })

  it('the exact solution sets the terminal online and leads to FINAL_SEQUENCE', () => {
    const g = atPuzzle2()
    expect(submit2(g, g.state!.puzzle2!.solution).result).toMatchObject({ ok: true, data: { solved: true } })
    expect(g.state!.phase).toBe('PUZZLE_2_COMPLETE')
    expect(g.state!.systems).toMatchObject({ breaker: true, terminal: true, door: false })
    g.advance(PHASE_COMPLETE_HOLD_MS)
    g.run({ type: 'tick' })
    expect(g.state!.phase).toBe('FINAL_SEQUENCE')
    expect(toView(g.state!).final).toEqual({ holding: [], forceAvailableAt: g.state!.phaseStartedAt + FINAL_FORCE_AFTER_MS })
  })

  it('a reconnecting player gets the same clues back', () => {
    const g = atPuzzle2()
    const first = g.run({ type: 'room:me', tokenHash: 'h1' }).result
    g.run({ type: 'room:join', playerId: 'x', playerName: 'Bea', tokenHash: 'new', rejoinTokenHash: 'h1' })
    const again = g.run({ type: 'room:me', tokenHash: 'h1' }).result
    expect(again).toEqual(first)
  })
})

describe('final sequence', () => {
  it('needs every connected player holding at once', () => {
    const g = atFinal()
    g.run({ type: 'final:press', tokenHash: 'h0', held: true })
    expect(g.state!.phase).toBe('FINAL_SEQUENCE')
    expect(toView(g.state!).final!.holding).toEqual(['p0'])
    g.run({ type: 'final:press', tokenHash: 'h1', held: true })
    expect(g.state!.phase).toBe('COMPLETE')
    expect(g.state!.systems.door).toBe(true)
    expect(g.state!.events.map((e) => e.type)).toContain('game:complete')
    expect(g.run({ type: 'final:press', tokenHash: 'h0', held: true }).result).toMatchObject({ ok: false, code: 'wrong_phase' })
  })

  it('tolerates a release inside the sync window, not outside it', () => {
    const inside = atFinal()
    inside.run({ type: 'final:press', tokenHash: 'h0', held: true })
    inside.run({ type: 'final:press', tokenHash: 'h0', held: false })
    inside.advance(FINAL_SYNC_WINDOW_MS)
    inside.run({ type: 'final:press', tokenHash: 'h1', held: true })
    expect(inside.state!.phase).toBe('COMPLETE')

    const outside = atFinal()
    outside.run({ type: 'final:press', tokenHash: 'h0', held: true })
    outside.run({ type: 'final:press', tokenHash: 'h0', held: false })
    outside.advance(FINAL_SYNC_WINDOW_MS + 1)
    outside.run({ type: 'final:press', tokenHash: 'h1', held: true })
    expect(outside.state!.phase).toBe('FINAL_SEQUENCE')
  })

  it('a disconnected player stops counting, so the others can still win', () => {
    const g = atFinal()
    g.advance(DISCONNECT_AFTER_MS - 1)
    g.run({ type: 'final:press', tokenHash: 'h0', held: true })
    g.advance(2)
    g.run({ type: 'tick' }) // p1 has been silent too long and drops out
    expect(g.state!.players[1].connected).toBe(false)
    expect(g.state!.phase).toBe('COMPLETE')
  })

  it('lets only the host force the door, and only after the wait', () => {
    const g = atFinal()
    expect(g.run({ type: 'final:force', tokenHash: 'h1' }).result).toMatchObject({ ok: false, code: 'not_host' })
    const early = g.run({ type: 'final:force', tokenHash: 'h0' }).result
    expect(early).toMatchObject({ ok: false, code: 'cooldown', retryAfterMs: FINAL_FORCE_AFTER_MS })
    g.advance(FINAL_FORCE_AFTER_MS)
    expect(g.run({ type: 'final:force', tokenHash: 'h0' }).result.ok).toBe(true)
    expect(g.state!.phase).toBe('COMPLETE')
  })
})

describe('reset and full digital playthrough', () => {
  it('plays LOBBY to COMPLETE, resets, and can play again', () => {
    const g = atFinal()
    g.run({ type: 'final:press', tokenHash: 'h0', held: true })
    g.run({ type: 'final:press', tokenHash: 'h1', held: true })
    expect(g.state!.phase).toBe('COMPLETE')
    const phases = g.state!.events.filter((e) => e.type === 'game:advance').map((e) => (e as { to: string }).to)
    expect(phases).toEqual([
      'READY', 'INTRO', 'PUZZLE_1', 'PUZZLE_1_COMPLETE', 'PUZZLE_2', 'PUZZLE_2_COMPLETE', 'FINAL_SEQUENCE', 'COMPLETE',
    ])

    expect(g.run({ type: 'game:reset', tokenHash: 'h1' }).result).toMatchObject({ ok: false, code: 'not_host' })
    expect(g.run({ type: 'game:reset', tokenHash: 'h0' }).result.ok).toBe(true)
    const view = toView(g.state!)
    expect(view.phase).toBe('LOBBY')
    expect(view.systems).toEqual({ breaker: false, terminal: false, door: false })
    expect(view.players.every((p) => !p.isReady && !p.role)).toBe(true)
    expect(view.puzzle2).toBeUndefined()
    expect((g.run({ type: 'room:me', tokenHash: 'h1' }).result as { data: MeData }).data.clue).toBeNull()

    g.run({ type: 'room:ready', tokenHash: 'h0', ready: true })
    g.run({ type: 'room:ready', tokenHash: 'h1', ready: true })
    expect(g.run({ type: 'game:start', tokenHash: 'h0' }).result.ok).toBe(true)
  })

  it('puzzle 2 works for 3 and 4 players', () => {
    for (const extra of [['Cy'], ['Cy', 'Di']]) {
      const g = game()
      g.create()
      g.join('Bea')
      extra.forEach((n) => g.join(n))
      g.state!.players.forEach((p) => g.run({ type: 'room:ready', tokenHash: p.tokenHash, ready: true }))
      g.run({ type: 'game:start', tokenHash: 'h0' })
      g.run({ type: 'intro:skip', tokenHash: 'h0' })
      submit1(g, { scanned: ['book', 'cup', 'keys'] })
      g.advance(PHASE_COMPLETE_HOLD_MS)
      g.run({ type: 'tick' })
      expect(Object.values(g.state!.clues).every((c) => c.length >= 1)).toBe(true)
      const res = submit2(g, g.state!.puzzle2!.solution).result as { data: SubmitData }
      expect(res.data.solved).toBe(true)
    }
  })
})
