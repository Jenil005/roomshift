import { describe, expect, it } from 'vitest'
import {
  DISCONNECT_AFTER_MS,
  FINAL_FORCE_AFTER_MS,
  FINAL_SYNC_WINDOW_MS,
  HOST_HANDOFF_AFTER_MS,
  LOBBY_DROP_AFTER_MS,
  MAX_PLAYERS,
  MISSION_DURATION_MS,
  PHASE_COMPLETE_HOLD_MS,
  PUZZLE1_COOLDOWN_MS,
  PUZZLE1_SCAN_MIN_CONFIDENCE,
  ROOM_IDLE_TTL_MS,
} from '@shared/constants'
import type { MeData, ScanData, SubmitData } from '@shared/events'
import { MODULES } from '@shared/puzzles/commsBoot'
import { nextDeadline, reduce, toView, type EngineCommand, type GameState } from './engine'
import { PUZZLE1_SOLUTION } from './puzzle1'
import { FALLBACK_NARRATION } from '../narration/fallback'

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
  it('INTRO never auto-advances and schedules no intro alarm', () => {
    const g = startedGame()
    // Only presence / idle deadlines remain, never an intro deadline.
    expect(nextDeadline(g.state)).toBe(T0 + DISCONNECT_AFTER_MS + 1)
    for (let i = 0; i < 10; i++) {
      g.advance(DISCONNECT_AFTER_MS - 1)
      g.run({ type: 'player:heartbeat', tokenHash: 'h0' })
      g.run({ type: 'player:heartbeat', tokenHash: 'h1' })
      g.run({ type: 'tick' })
    }
    expect(g.state!.phase).toBe('INTRO')
    expect(toView(g.state!).missionStartedAt).toBeUndefined() // no countdown during role reveal
  })

  it('only the host can proceed from INTRO; proceeding starts the mission countdown', () => {
    const g = startedGame()
    g.advance(5_000)
    expect(g.run({ type: 'intro:skip', tokenHash: 'h1' }).result).toMatchObject({ ok: false, code: 'not_host' })
    expect(g.state!.phase).toBe('INTRO')
    expect(g.state!.missionStartedAt).toBeFalsy()
    const out = g.run({ type: 'intro:skip', tokenHash: 'h0' })
    expect(out.result).toMatchObject({ ok: true, data: { room: { phase: 'PUZZLE_1', missionStartedAt: T0 + 5_000 } } })
    expect(g.state!.phase).toBe('PUZZLE_1')
    // A duplicate press (double tap, retried request) does not restart the countdown.
    g.advance(1_000)
    expect(g.run({ type: 'intro:skip', tokenHash: 'h0' }).result).toMatchObject({ ok: false, code: 'wrong_phase' })
    expect(toView(g.state!).missionStartedAt).toBe(T0 + 5_000)
  })

  it('a handed-off host can proceed, and the old host no longer can', () => {
    // The host's phone goes silent during role reveal while player 2 keeps a heartbeat.
    const introHostGone = () => {
      const g = startedGame()
      for (let t = 0; t <= HOST_HANDOFF_AFTER_MS; t += 5_000) {
        g.advance(5_000)
        g.run({ type: 'player:heartbeat', tokenHash: 'h1' })
      }
      return g
    }
    const g = introHostGone()
    expect(g.state!.hostId).toBe('p1')
    expect(g.state!.phase).toBe('INTRO')
    expect(g.run({ type: 'intro:skip', tokenHash: 'h1' }).result.ok).toBe(true)
    expect(g.state!.phase).toBe('PUZZLE_1')

    // The old host comes back: no longer host, so they cannot proceed.
    const s = introHostGone()
    expect(s.run({ type: 'intro:skip', tokenHash: 'h0' }).result).toMatchObject({ ok: false, code: 'not_host' })
    expect(s.state!.phase).toBe('INTRO')
  })

  it('the mission start is the same for every player, survives rejoin, and resets with the game', () => {
    const g = startedGame()
    g.run({ type: 'intro:skip', tokenHash: 'h0' })
    const started = T0
    g.advance(90_000)
    const a = g.run({ type: 'player:heartbeat', tokenHash: 'h0' }).result
    const b = g.run({ type: 'player:heartbeat', tokenHash: 'h1' }).result
    expect(a).toMatchObject({ ok: true, data: { room: { missionStartedAt: started } } })
    expect(b).toMatchObject({ ok: true, data: { room: { missionStartedAt: started } } })
    // Page refresh: rejoin with the stored token, then the unauthenticated poll.
    const re = g.run({ type: 'room:join', playerId: 'px', playerName: 'Bea', tokenHash: 'hx', rejoinTokenHash: 'h1' })
    expect(re.result).toMatchObject({ ok: true, data: { rejoined: true, room: { missionStartedAt: started } } })
    expect(g.run({ type: 'room:view' }).result).toMatchObject({ ok: true, data: { room: { missionStartedAt: started } } })
    // It lives on the state, so it outlives the bounded event list.
    for (let i = 0; i < 15; i++) {
      g.run({ type: 'puzzle1:scan', tokenHash: 'h0', scan: { object: 'book', source: 'qr' } })
      g.run({ type: 'puzzle1:restart', tokenHash: 'h0' })
    }
    const view = toView(g.state!)
    expect(view.events.some((e) => e.type === 'game:advance' && e.to === 'PUZZLE_1')).toBe(false)
    expect(view.missionStartedAt).toBe(started)

    g.run({ type: 'game:reset', tokenHash: 'h0' })
    expect(toView(g.state!).missionStartedAt).toBeUndefined()
    g.run({ type: 'room:ready', tokenHash: 'h0', ready: true })
    g.run({ type: 'room:ready', tokenHash: 'h1', ready: true })
    g.run({ type: 'game:start', tokenHash: 'h0' })
    expect(toView(g.state!).missionStartedAt).toBeUndefined()
    g.advance(2_000)
    g.run({ type: 'intro:skip', tokenHash: 'h0' })
    expect(toView(g.state!).missionStartedAt).toBe(started + 90_000 + 2_000)
    expect(MISSION_DURATION_MS).toBe(8 * 60_000)
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

const submit1 = (g: ReturnType<typeof game>, extra: { manualCode?: string }, tokenHash = 'h1') =>
  g.run({ type: 'puzzle:submit', tokenHash, puzzle: 1, ...extra })

const scan = (g: ReturnType<typeof game>, object: string, tokenHash = 'h1', confidence = 0.8) =>
  g.run({ type: 'puzzle1:scan', tokenHash, scan: { object, source: 'ai', confidence } })

type ScanResult = { ok: true; data: ScanData }
const scanData = (out: ReturnType<typeof scan>) => (out.result as ScanResult).data

function scanAll(g: ReturnType<typeof game>) {
  for (const object of PUZZLE1_SOLUTION) scan(g, object)
}

function atPuzzle2() {
  const g = atPuzzle1()
  scanAll(g)
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

describe('puzzle 1 (sequential object scans)', () => {
  it('only accepts scans, restarts and reports during PUZZLE_1', () => {
    const g = startedGame()
    expect(scan(g, 'book').result).toMatchObject({ ok: false, code: 'wrong_phase' })
    expect(g.run({ type: 'puzzle1:restart', tokenHash: 'h1' }).result).toMatchObject({ ok: false, code: 'wrong_phase' })
    expect(submit1(g, { manualCode: 'bck' }).result).toMatchObject({ ok: false, code: 'wrong_phase' })
  })

  it('keeps BOOK scanned while CUP and then KEYBOARD are scanned on their own', () => {
    const g = atPuzzle1()
    expect(toView(g.state!).puzzle1).toEqual({ scanned: [] })
    expect(scanData(scan(g, 'book'))).toMatchObject({ status: 'accepted', object: 'book' })
    // BOOK is not sent again: CUP alone is the next scan, as if BOOK had left the frame.
    expect(scanData(scan(g, 'cup'))).toMatchObject({ status: 'accepted', object: 'cup' })
    expect(toView(g.state!).puzzle1!.scanned.map((s) => s.object)).toEqual(['book', 'cup'])
    expect(g.state!.systems.breaker).toBe(false) // no success before the last object
    const last = scanData(scan(g, 'keyboard'))
    expect(last).toMatchObject({ status: 'solved', object: 'keyboard' })
    expect(last.room.puzzle1!.scanned.map((s) => s.object)).toEqual(['book', 'cup', 'keyboard'])
    expect(g.state!.phase).toBe('PUZZLE_1_COMPLETE')
    expect(g.state!.systems.breaker).toBe(true)
    expect(g.state!.puzzles[1]).toMatchObject({ solved: true, verifiedBy: 'camera', attempts: 0 })
    const counts = g.state!.events.flatMap((e) => (e.type === 'puzzle1:scanned' ? [e.count] : []))
    expect(counts).toEqual([1, 2, 3])
    expect(scan(g, 'book').result).toMatchObject({ ok: false, code: 'wrong_phase' })
    expect(nextDeadline(g.state)).toBe(g.state!.phaseStartedAt + PHASE_COMPLETE_HOLD_MS)
  })

  it('records who scanned and how, and shares progress across the team', () => {
    const g = atPuzzle1()
    scan(g, 'book', 'h0')
    g.run({ type: 'puzzle1:scan', tokenHash: 'h1', scan: { object: 'cup', source: 'qr' } })
    expect(toView(g.state!).puzzle1!.scanned).toMatchObject([
      { object: 'book', source: 'ai', by: 'p0' },
      { object: 'cup', source: 'qr', by: 'p1' },
    ])
  })

  it('a duplicate sighting changes nothing: no progress, no event, no new version', () => {
    const g = atPuzzle1()
    scan(g, 'book')
    const before = { version: g.state!.version, seq: g.state!.seq }
    const again = scan(g, 'BOOK')
    expect(scanData(again)).toMatchObject({ status: 'duplicate', object: 'book' })
    expect(again.viewChanged).toBe(false)
    expect({ version: g.state!.version, seq: g.state!.seq }).toEqual(before)
    expect(g.state!.puzzle1!.scans).toHaveLength(1)
    expect(g.state!.puzzles[1].attempts).toBe(0)
  })

  it('refuses low-confidence, unknown and malformed scans without counting or changing progress', () => {
    const g = atPuzzle1()
    scan(g, 'book')
    expect(scan(g, 'cup', 'h1', PUZZLE1_SCAN_MIN_CONFIDENCE - 0.1).result).toMatchObject({ ok: false, code: 'bad_request' })
    expect(scan(g, 'phone').result).toMatchObject({ ok: false, code: 'bad_request' })
    const noScore = g.run({ type: 'puzzle1:scan', tokenHash: 'h1', scan: { object: 'cup', source: 'ai' } })
    expect(noScore.result).toMatchObject({ ok: false, code: 'bad_request' })
    expect(g.state!.puzzle1!.scans.map((s) => s.object)).toEqual(['book'])
    expect(g.state!.puzzles[1].attempts).toBe(0)
  })

  it('an out-of-sequence scan is a failed attempt: progress resets and the cooldown applies', () => {
    const g = atPuzzle1()
    scan(g, 'book')
    const wrong = scanData(scan(g, 'keyboard'))
    expect(wrong).toMatchObject({
      status: 'rejected',
      object: 'keyboard',
      reason: 'KEYBOARD scanned out of sequence',
      retryAfterMs: PUZZLE1_COOLDOWN_MS,
    })
    expect(wrong.room.puzzle1!.scanned).toEqual([])
    expect(g.state!.puzzles[1]).toMatchObject({ attempts: 1, solved: false, lastFailure: 'KEYBOARD scanned out of sequence' })
    expect(g.state!.events.at(-1)).toMatchObject({ type: 'puzzle:failed', puzzle: 1 })
    // Inside the cooldown a scan is refused and not counted.
    expect(scan(g, 'book').result).toMatchObject({ ok: false, code: 'cooldown' })
    g.advance(PUZZLE1_COOLDOWN_MS)
    expect(scanData(scan(g, 'cup')).status).toBe('rejected') // the attempt starts from the first object again
    expect(g.state!.puzzles[1].attempts).toBe(2)
    g.advance(PUZZLE1_COOLDOWN_MS)
    scanAll(g)
    expect(g.state!.phase).toBe('PUZZLE_1_COMPLETE')
  })

  it('puzzle1:restart clears progress without counting a failure', () => {
    const g = atPuzzle1()
    scan(g, 'book')
    scan(g, 'cup')
    expect(g.run({ type: 'puzzle1:restart', tokenHash: 'h0' }).result.ok).toBe(true)
    expect(toView(g.state!).puzzle1!.scanned).toEqual([])
    expect(g.state!.puzzles[1].attempts).toBe(0)
    expect(g.state!.events.at(-1)).toMatchObject({ type: 'puzzle1:restarted', playerId: 'p0' })
    expect(scanData(scan(g, 'book')).status).toBe('accepted')
  })

  it('a reconnect keeps accepted progress, and a re-sent scan does not duplicate it', () => {
    const g = atPuzzle1()
    scan(g, 'book')
    g.advance(DISCONNECT_AFTER_MS + 1)
    g.run({ type: 'tick' })
    expect(g.state!.players.find((p) => p.id === 'p1')!.connected).toBe(false)
    const rejoin = g.run({ type: 'room:join', playerId: 'new', playerName: 'Bea', tokenHash: 'x', rejoinTokenHash: 'h1' })
    expect(rejoin.result).toMatchObject({ ok: true, data: { rejoined: true, room: { puzzle1: { scanned: [{ object: 'book' }] } } } })
    // The phone retries the request whose reply it lost.
    expect(scanData(scan(g, 'book')).status).toBe('duplicate')
    expect(scanData(scan(g, 'cup')).status).toBe('accepted')
    expect(g.state!.puzzle1!.scans.map((s) => s.object)).toEqual(['book', 'cup'])
  })

  it('works for a room stored before scan progress existed', () => {
    const g = atPuzzle1()
    delete g.state!.puzzle1
    expect(toView(g.state!).puzzle1).toBeUndefined()
    expect(scanData(scan(g, 'book')).status).toBe('accepted')
  })

  it('game:reset clears scan progress', () => {
    const g = atPuzzle1()
    scan(g, 'book')
    g.run({ type: 'game:reset', tokenHash: 'h0' })
    expect(toView(g.state!).puzzle1).toBeUndefined()
  })

  it('keeps the manual fallback, recorded as manual, with its own failures and cooldown', () => {
    const g = atPuzzle1()
    expect(submit1(g, {}).result).toMatchObject({ ok: false, code: 'bad_request' })
    expect(submit1(g, { manualCode: 'cbk' }).result).toMatchObject({
      ok: true,
      data: { solved: false, reason: 'Wrong order', retryAfterMs: PUZZLE1_COOLDOWN_MS },
    })
    expect(submit1(g, { manualCode: 'bck' }).result).toMatchObject({ ok: false, code: 'cooldown' })
    g.advance(PUZZLE1_COOLDOWN_MS)
    const physical = { source: 'manual' as const, order: ['BOOK', 'CUP', 'KEYBOARD'] }
    const res = g.run({ type: 'puzzle:submit', tokenHash: 'h1', puzzle: 1, physical }).result
    expect(res).toMatchObject({ ok: true, data: { solved: true, room: { puzzles: { 1: { verifiedBy: 'manual' } } } } })
    expect(g.state!.events.find((e) => e.type === 'puzzle:verified')).toMatchObject({ puzzle: 1, verifiedBy: 'manual' })
  })
})

describe('narration', () => {
  it('always has a fallback line, refreshed on every phase change', () => {
    const g = game()
    g.create()
    expect(toView(g.state!)).toMatchObject({ narration: FALLBACK_NARRATION.LOBBY, narrationSource: 'fallback' })
    g.join('Bea')
    g.run({ type: 'room:ready', tokenHash: 'h0', ready: true })
    g.run({ type: 'room:ready', tokenHash: 'h1', ready: true })
    g.run({ type: 'game:start', tokenHash: 'h0' })
    expect(toView(g.state!)).toMatchObject({ narration: FALLBACK_NARRATION.INTRO, narrationSource: 'fallback' })
  })

  it('applies a Gemini line only while the room is still in that phase', () => {
    const g = startedGame()
    expect(g.run({ type: 'narration:set', phase: 'INTRO', text: 'Sirens fade.' }).result).toMatchObject({
      ok: true,
      data: { applied: true },
    })
    expect(toView(g.state!)).toMatchObject({ narration: 'Sirens fade.', narrationSource: 'gemini' })
    g.run({ type: 'intro:skip', tokenHash: 'h0' })
    // A slow reply for INTRO arriving during PUZZLE_1 is dropped.
    expect(g.run({ type: 'narration:set', phase: 'INTRO', text: 'Too late.' }).result).toMatchObject({
      ok: true,
      data: { applied: false },
    })
    expect(toView(g.state!)).toMatchObject({ narration: FALLBACK_NARRATION.PUZZLE_1, narrationSource: 'fallback' })
  })

  it('narration never changes phase, systems or puzzles', () => {
    const g = startedGame()
    const before = toView(g.state!)
    g.run({ type: 'narration:set', phase: 'INTRO', text: 'Mission complete. Door open. Puzzle solved.' })
    const after = toView(g.state!)
    expect({ ...after, narration: undefined, narrationSource: undefined, version: 0 }).toEqual({
      ...before,
      narration: undefined,
      narrationSource: undefined,
      version: 0,
    })
  })

  it('reset restores the lobby fallback line', () => {
    const g = startedGame()
    g.run({ type: 'narration:set', phase: 'INTRO', text: 'Gemini line.' })
    g.run({ type: 'game:reset', tokenHash: 'h0' })
    expect(toView(g.state!)).toMatchObject({ narration: FALLBACK_NARRATION.LOBBY, narrationSource: 'fallback' })
  })
})

describe('host handoff', () => {
  // Bea keeps sending heartbeats; the host (h0) goes silent mid-game.
  function hostGoesSilent(ms: number) {
    const g = atPuzzle1()
    for (let t = 0; t < ms; t += 5000) {
      g.advance(Math.min(5000, ms - t))
      g.run({ type: 'player:heartbeat', tokenHash: 'h1' })
    }
    return g
  }

  it('passes host to a connected player after the host is away long enough', () => {
    const g = hostGoesSilent(HOST_HANDOFF_AFTER_MS + 1000)
    expect(g.state!.hostId).toBe('p1')
    expect(g.state!.players.map((p) => p.isHost)).toEqual([false, true])
    // The new host can use host controls; the old host keeps role and clues.
    expect(g.run({ type: 'game:reset', tokenHash: 'h1' }).result.ok).toBe(true)
    expect(g.state!.players[0].id).toBe('p0')
  })

  it('does not hand off during a short absence', () => {
    const g = hostGoesSilent(HOST_HANDOFF_AFTER_MS - 1000)
    expect(g.state!.hostId).toBe('p0')
    expect(g.state!.players[0].connected).toBe(false)
  })

  it('schedules the handoff on the alarm', () => {
    const g = hostGoesSilent(DISCONNECT_AFTER_MS + 5000)
    const host = g.state!.players[0]
    expect(nextDeadline(g.state)).toBeLessThanOrEqual(host.lastSeen + HOST_HANDOFF_AFTER_MS + 1)
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

  it('still applies timers, so a poll can observe a complete-hold ending', () => {
    const g = startedGame()
    g.run({ type: 'intro:skip', tokenHash: 'h0' })
    g.run({ type: 'puzzle:submit', tokenHash: 'h0', puzzle: 1, manualCode: 'BCK' })
    expect(g.state!.phase).toBe('PUZZLE_1_COMPLETE')
    g.advance(PHASE_COMPLETE_HOLD_MS)
    expect(g.run({ type: 'room:view' }).result).toMatchObject({ ok: true, data: { room: { phase: 'PUZZLE_2' } } })
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
      scanAll(g)
      g.advance(PHASE_COMPLETE_HOLD_MS)
      g.run({ type: 'tick' })
      expect(Object.values(g.state!.clues).every((c) => c.length >= 1)).toBe(true)
      const res = submit2(g, g.state!.puzzle2!.solution).result as { data: SubmitData }
      expect(res.data.solved).toBe(true)
    }
  })
})

describe('demo tools', () => {
  const demo = (g: ReturnType<typeof game>, type: 'demo:skip' | 'demo:win' | 'demo:fail', tokenHash = 'h0') =>
    g.run({ type, tokenHash })
  const pause = (g: ReturnType<typeof game>, paused: boolean) => g.run({ type: 'demo:pause', tokenHash: 'h0', paused })

  it('are host only, and only during a mission', () => {
    const g = startedGame()
    for (const type of ['demo:skip', 'demo:win', 'demo:fail'] as const) {
      expect(demo(g, type, 'h1').result).toMatchObject({ ok: false, code: 'not_host' })
    }
    expect(g.state!.phase).toBe('INTRO')
    const lobby = lobbyOfTwo()
    expect(demo(lobby, 'demo:skip').result).toMatchObject({ ok: false, code: 'wrong_phase' })
  })

  it('skip walks every stage through to COMPLETE', () => {
    const g = startedGame()
    const phases: string[] = []
    while (g.state!.phase !== 'COMPLETE') {
      expect(demo(g, 'demo:skip').result.ok).toBe(true)
      phases.push(g.state!.phase)
    }
    expect(phases).toEqual(['PUZZLE_1', 'PUZZLE_1_COMPLETE', 'PUZZLE_2', 'PUZZLE_2_COMPLETE', 'FINAL_SEQUENCE', 'COMPLETE'])
    expect(g.state!.systems).toEqual({ breaker: true, terminal: true, door: true })
    expect(g.state!.puzzles[1]).toMatchObject({ solved: true })
    expect(g.state!.puzzles[1].verifiedBy).toBeUndefined() // skipped, not verified
  })

  it('the mission clock starts with puzzle 1 and pauses for everyone', () => {
    const g = startedGame()
    expect(pause(g, true).result).toMatchObject({ ok: false, code: 'wrong_phase' }) // no clock in INTRO
    g.advance(5_000)
    g.run({ type: 'intro:skip', tokenHash: 'h0' })
    const start = T0 + 5_000
    expect(toView(g.state!).mission).toEqual({ startedAt: start, durationMs: MISSION_DURATION_MS, pausedMs: 0 })
    g.advance(10_000)
    pause(g, true)
    expect(g.state!.mission!.pausedAt).toBe(start + 10_000)
    g.advance(30_000)
    pause(g, true) // already paused: no change
    pause(g, false)
    expect(g.state!.mission).toEqual({ startedAt: start, durationMs: MISSION_DURATION_MS, pausedMs: 30_000 })
  })

  it('win and fail end the mission and freeze the clock; reset clears it', () => {
    const w = atPuzzle1()
    expect(demo(w, 'demo:win').result.ok).toBe(true)
    expect(w.state!.phase).toBe('COMPLETE')
    expect(w.state!.systems.door).toBe(true)
    expect(w.state!.mission!.pausedAt).toBeDefined()

    const f = atPuzzle1()
    expect(demo(f, 'demo:fail').result.ok).toBe(true)
    expect(f.state!.phase).toBe('FAILED')
    expect(f.state!.mission!.pausedAt).toBeDefined()
    expect(demo(f, 'demo:skip').result).toMatchObject({ ok: false, code: 'wrong_phase' })
    f.run({ type: 'game:reset', tokenHash: 'h0' })
    expect(f.state!.phase).toBe('LOBBY')
    expect(toView(f.state!).mission).toBeUndefined()
  })
})
