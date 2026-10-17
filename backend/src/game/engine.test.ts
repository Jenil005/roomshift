import { describe, expect, it } from 'vitest'
import {
  DISCONNECT_AFTER_MS,
  INTRO_DURATION_MS,
  LOBBY_DROP_AFTER_MS,
  MAX_PLAYERS,
  ROOM_IDLE_TTL_MS,
} from '@shared/constants'
import type { MeData } from '@shared/events'
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
