/**
 * RoomShift game engine: the authoritative state machine, pure and synchronous.
 *
 * `reduce(state, command, ctx)` validates one command against the current state and
 * returns the next state plus the typed result for the caller. No I/O happens here:
 * GameRoom (the Durable Object) persists the state and mirrors `toView(state)` to
 * clients. Clients never set phase, roles or puzzle outcomes; they only send commands.
 *
 * LOBBY -> READY -> INTRO -> PUZZLE_1 -> PUZZLE_1_COMPLETE -> PUZZLE_2
 *       -> PUZZLE_2_COMPLETE -> FINAL_SEQUENCE -> COMPLETE
 */

import {
  DISCONNECT_AFTER_MS,
  FINAL_FORCE_AFTER_MS,
  FINAL_SYNC_WINDOW_MS,
  INTRO_DURATION_MS,
  LOBBY_DROP_AFTER_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MISSION_ID,
  PHASE_COMPLETE_HOLD_MS,
  PLAYER_NAME_MAX_LENGTH,
  PUZZLE2_COOLDOWNS_MS,
  PUZZLE2_HINT_AFTER_ATTEMPTS,
  ROLE_IDS,
  ROOM_IDLE_TTL_MS,
} from '@shared/constants'
import type { GameErrorCode, GameResult, JoinData, MeData, RoomData, ServerEvent, SubmitData } from '@shared/events'
import { checkOrder, describe, generatePuzzle, MODULES, type ModuleId } from '@shared/puzzles/commsBoot'
import type {
  GamePhase,
  Player,
  PrivateClue,
  PuzzleProgress,
  RoleId,
  Room,
  RoomEventEntry,
  SystemsState,
} from '@shared/types'
import { checkPuzzle1, dealPuzzle1Clues } from './puzzle1'

const MAX_EVENTS = 20
/** room:create on an existing code; the route retries with a fresh code. */
export const CODE_TAKEN_MESSAGE = 'Room code already in use'

export interface ServerPlayer {
  id: string
  name: string
  isHost: boolean
  isReady: boolean
  connected: boolean
  role?: RoleId
  joinedAt: number
  lastSeen: number
  tokenHash: string // SHA-256 of the player's bearer token; never leaves the server
}

/** Puzzle 2 server state. `solution` is never sent to clients. */
export interface Puzzle2State {
  seed: number
  solution: ModuleId[]
  hints: string[] // both hint texts; the first `released` are public
  released: number
  draft: ModuleId[]
}

export interface FinalState {
  holds: Record<string, { held: boolean; releasedAt?: number }>
}

/** Full server-side state of one room. Only `toView()` of it is ever sent to clients. */
export interface GameState {
  code: string
  phase: GamePhase
  hostId: string
  missionId: string
  createdAt: number
  phaseStartedAt: number
  lastActivity: number
  version: number
  seq: number
  players: ServerPlayer[]
  systems: SystemsState
  puzzles: { 1: PuzzleProgress; 2: PuzzleProgress }
  clues: Record<string, string[]> // playerId -> private clue lines for the current puzzle
  puzzle2: Puzzle2State | null
  final: FinalState | null
  events: RoomEventEntry[]
  narration?: string
}

type Authed = { tokenHash: string }

/** Commands after the worker route has authenticated and hashed tokens. */
export type EngineCommand =
  | { type: 'room:create'; code: string; playerId: string; playerName: string; tokenHash: string }
  | {
      type: 'room:join'
      playerId: string
      playerName: string
      tokenHash: string
      rejoinTokenHash?: string // present when the client sent its old playerToken
    }
  | ({ type: 'room:leave' } & Authed)
  | ({ type: 'room:ready'; ready: boolean } & Authed)
  | ({ type: 'game:start' } & Authed)
  | ({ type: 'game:reset' } & Authed)
  | ({ type: 'intro:skip' } & Authed)
  | ({ type: 'player:heartbeat' } & Authed)
  | ({ type: 'room:me' } & Authed)
  | ({ type: 'puzzle:submit'; puzzle: 1 | 2; scanned?: string[]; manualCode?: string; order?: string[] } & Authed)
  | ({ type: 'puzzle2:draft'; order: string[] } & Authed)
  | ({ type: 'final:press'; held: boolean } & Authed)
  | ({ type: 'final:force' } & Authed)
  | { type: 'tick' } // timers: presence, auto-advance, idle cleanup

export interface EngineContext {
  now: number
  random: () => number // [0, 1); injectable for deterministic tests
}

/** `data` of a join/create result before the route adds the raw playerToken. */
export type JoinResultData = Omit<JoinData, 'playerToken'> & { rejoined: boolean }

export interface EngineOutput {
  state: GameState | null // null = room deleted
  result: GameResult
  viewChanged: boolean // true when clients need the new view
}

const ok = <T>(data: T): GameResult<T> => ({ ok: true, data })
const fail = (code: GameErrorCode, message: string, retryAfterMs?: number): GameResult =>
  retryAfterMs === undefined ? { ok: false, code, message } : { ok: false, code, message, retryAfterMs }

export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLAYER_NAME_MAX_LENGTH)
}

export function toView(state: GameState): Room {
  const players: Player[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    isReady: p.isReady,
    connected: p.connected,
    ...(p.role ? { role: p.role } : {}),
  }))
  return {
    code: state.code,
    phase: state.phase,
    players,
    createdAt: state.createdAt,
    ...(state.narration ? { narration: state.narration } : {}),
    hostId: state.hostId,
    missionId: state.missionId,
    phaseStartedAt: state.phaseStartedAt,
    systems: state.systems,
    puzzles: state.puzzles,
    version: state.version,
    events: state.events,
    ...(state.puzzle2
      ? { puzzle2: { draft: state.puzzle2.draft, hints: state.puzzle2.hints.slice(0, state.puzzle2.released) } }
      : {}),
    ...(state.final
      ? {
          final: {
            holding: state.players.filter((p) => state.final!.holds[p.id]?.held).map((p) => p.id),
            forceAvailableAt: state.phaseStartedAt + FINAL_FORCE_AFTER_MS,
          },
        }
      : {}),
  }
}

// Everything clients can see except `version`, so a heartbeat that only moves
// lastSeen does not bump the version or trigger a broadcast.
function viewKey(state: GameState | null): string {
  if (!state) return ''
  const { version: _version, ...rest } = toView(state)
  return JSON.stringify(rest)
}

function emit(state: GameState, event: ServerEvent, now: number): void {
  state.seq += 1
  state.events.push({ ...event, seq: state.seq, at: now })
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS)
}

function setPhase(state: GameState, phase: GamePhase, now: number): void {
  if (state.phase === phase) return
  state.phase = phase
  state.phaseStartedAt = now
  emit(state, { type: 'game:advance', to: phase }, now)
}

const inLobby = (state: GameState) => state.phase === 'LOBBY' || state.phase === 'READY'

/** LOBBY <-> READY: READY needs MIN_PLAYERS connected and every player ready. */
function recomputeLobby(state: GameState, now: number): void {
  if (!inLobby(state)) return
  const connected = state.players.filter((p) => p.connected).length
  const allReady = state.players.length > 0 && state.players.every((p) => p.isReady)
  setPhase(state, connected >= MIN_PLAYERS && allReady ? 'READY' : 'LOBBY', now)
}

function removePlayer(state: GameState, playerId: string): void {
  state.players = state.players.filter((p) => p.id !== playerId)
  delete state.clues[playerId]
  if (state.hostId === playerId && state.players.length > 0) {
    // Hand the room to the longest-present player so the lobby never loses its host.
    const next = state.players[0]
    next.isHost = true
    state.hostId = next.id
  }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** PUZZLE_1_COMPLETE -> PUZZLE_2: deal the Comms Boot puzzle (docs/PUZZLE_2_SPEC.md). */
function enterPuzzle2(state: GameState, ctx: EngineContext): void {
  const seed = Math.floor(ctx.random() * 2 ** 32)
  const ids = state.players.map((p) => p.id)
  const generated = generatePuzzle(ids, seed)
  state.puzzle2 = {
    seed,
    solution: generated.solution,
    hints: generated.hints.map(describe),
    released: 0,
    draft: [],
  }
  state.clues = Object.fromEntries(ids.map((id) => [id, generated.constraints[id].map(describe)]))
  setPhase(state, 'PUZZLE_2', ctx.now)
}

function enterFinal(state: GameState, now: number): void {
  state.final = { holds: {} }
  setPhase(state, 'FINAL_SEQUENCE', now)
}

function completeGame(state: GameState, now: number): void {
  state.systems.door = true
  state.final = null
  emit(state, { type: 'game:complete' }, now)
  setPhase(state, 'COMPLETE', now)
}

/** Every connected player is holding (a release within the sync window still counts). */
function everyoneHolding(state: GameState, now: number): boolean {
  if (!state.final) return false
  const connected = state.players.filter((p) => p.connected)
  if (connected.length === 0) return false
  return connected.every((p) => {
    const hold = state.final!.holds[p.id]
    return !!hold && (hold.held || (hold.releasedAt !== undefined && now - hold.releasedAt <= FINAL_SYNC_WINDOW_MS))
  })
}

/** Time-driven transitions. Runs before every command and on the room's alarm. */
function applyTimers(state: GameState, ctx: EngineContext): GameState | null {
  const { now } = ctx
  if (now - state.lastActivity > ROOM_IDLE_TTL_MS) return null

  for (const p of state.players) {
    if (p.connected && now - p.lastSeen > DISCONNECT_AFTER_MS) p.connected = false
  }
  if (inLobby(state)) {
    for (const p of [...state.players]) {
      if (!p.connected && now - p.lastSeen > LOBBY_DROP_AFTER_MS) removePlayer(state, p.id)
    }
    if (state.players.length === 0) return null
    recomputeLobby(state, now)
  }
  const elapsed = now - state.phaseStartedAt
  if (state.phase === 'INTRO' && elapsed >= INTRO_DURATION_MS) setPhase(state, 'PUZZLE_1', now)
  if (state.phase === 'PUZZLE_1_COMPLETE' && elapsed >= PHASE_COMPLETE_HOLD_MS) enterPuzzle2(state, ctx)
  if (state.phase === 'PUZZLE_2_COMPLETE' && elapsed >= PHASE_COMPLETE_HOLD_MS) enterFinal(state, now)
  // A player who drops mid-hold stops counting, so the others may already be enough.
  if (state.phase === 'FINAL_SEQUENCE' && everyoneHolding(state, now)) completeGame(state, now)
  return state
}

/** Earliest future time at which applyTimers would change something, or null. */
export function nextDeadline(state: GameState | null): number | null {
  if (!state) return null
  const times: number[] = [state.lastActivity + ROOM_IDLE_TTL_MS + 1]
  for (const p of state.players) {
    if (p.connected) times.push(p.lastSeen + DISCONNECT_AFTER_MS + 1)
    else if (inLobby(state)) times.push(p.lastSeen + LOBBY_DROP_AFTER_MS + 1)
  }
  if (state.phase === 'INTRO') times.push(state.phaseStartedAt + INTRO_DURATION_MS)
  if (state.phase === 'PUZZLE_1_COMPLETE' || state.phase === 'PUZZLE_2_COMPLETE') {
    times.push(state.phaseStartedAt + PHASE_COMPLETE_HOLD_MS)
  }
  return Math.min(...times)
}

const freshProgress = (): { 1: PuzzleProgress; 2: PuzzleProgress } => ({
  1: { solved: false, attempts: 0 },
  2: { solved: false, attempts: 0 },
})

function newState(code: string, host: ServerPlayer, now: number): GameState {
  return {
    code,
    phase: 'LOBBY',
    hostId: host.id,
    missionId: MISSION_ID,
    createdAt: now,
    phaseStartedAt: now,
    lastActivity: now,
    version: 0,
    seq: 0,
    players: [host],
    systems: { breaker: false, terminal: false, door: false },
    puzzles: freshProgress(),
    clues: {},
    puzzle2: null,
    final: null,
    events: [],
  }
}

function newPlayer(id: string, name: string, tokenHash: string, isHost: boolean, now: number): ServerPlayer {
  return { id, name, isHost, isReady: false, connected: true, joinedAt: now, lastSeen: now, tokenHash }
}

function joinData(state: GameState, playerId: string, rejoined: boolean): JoinResultData {
  return { code: state.code, playerId, room: toView(state), rejoined }
}

export function reduce(prev: GameState | null, command: EngineCommand, ctx: EngineContext): EngineOutput {
  const before = viewKey(prev)
  const draft = prev ? structuredClone(prev) : null
  const { state, result } = apply(draft, command, ctx)
  if (state && viewKey(state) !== before) state.version += 1
  const viewChanged = viewKey(state) !== before
  // Results carry the view; refresh it so `room.version` matches the stored state.
  if (state && result.ok && result.data && typeof result.data === 'object' && 'room' in result.data) {
    ;(result.data as { room: Room }).room = toView(state)
  }
  return { state, result, viewChanged }
}

function apply(
  draft: GameState | null,
  command: EngineCommand,
  ctx: EngineContext,
): { state: GameState | null; result: GameResult } {
  const { now } = ctx

  if (command.type === 'room:create') {
    if (draft) return { state: draft, result: fail('server_error', CODE_TAKEN_MESSAGE) }
    const name = sanitizeName(command.playerName)
    if (!name) return { state: null, result: fail('bad_request', 'Enter a name') }
    const state = newState(command.code, newPlayer(command.playerId, name, command.tokenHash, true, now), now)
    return { state, result: ok(joinData(state, command.playerId, false)) }
  }

  if (!draft) return { state: null, result: fail('room_not_found', 'No room with that code') }
  let state: GameState | null = applyTimers(draft, ctx)
  if (!state) return { state: null, result: fail('room_not_found', 'No room with that code') }

  if (command.type === 'tick') return { state, result: ok({}) }

  if (command.type === 'room:join') {
    if (command.rejoinTokenHash) {
      const existing = state.players.find((p) => p.tokenHash === command.rejoinTokenHash)
      if (existing) {
        existing.connected = true
        existing.lastSeen = now
        state.lastActivity = now
        recomputeLobby(state, now)
        return { state, result: ok(joinData(state, existing.id, true)) }
      }
    }
    if (!inLobby(state)) return { state, result: fail('game_started', 'This mission has already started') }
    if (state.players.length >= MAX_PLAYERS) return { state, result: fail('room_full', 'This room is full') }
    const name = sanitizeName(command.playerName)
    if (!name) return { state, result: fail('bad_request', 'Enter a name') }
    if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return { state, result: fail('name_taken', 'Someone in this room already has that name') }
    }
    state.players.push(newPlayer(command.playerId, name, command.tokenHash, false, now))
    state.lastActivity = now
    recomputeLobby(state, now)
    return { state, result: ok(joinData(state, command.playerId, false)) }
  }

  // Every other command is authenticated by the caller's token.
  const player = state.players.find((p) => p.tokenHash === command.tokenHash)
  if (!player) return { state, result: fail('not_in_room', 'You are not in this room. Join again.') }
  player.lastSeen = now
  player.connected = true
  state.lastActivity = now
  recomputeLobby(state, now)

  const room = (): RoomData => ({ room: toView(state!) })
  const isHost = player.id === state.hostId

  switch (command.type) {
    case 'player:heartbeat':
      return { state, result: ok(room()) }

    case 'room:me': {
      const lines = state.clues[player.id]
      const clue: PrivateClue | null =
        player.role && lines ? { playerId: player.id, role: player.role, text: lines.join(' '), clues: lines } : null
      const data: MeData = { playerId: player.id, clue, room: toView(state) }
      return { state, result: ok(data) }
    }

    case 'room:leave': {
      if (inLobby(state)) {
        removePlayer(state, player.id)
        if (state.players.length === 0) state = null
        else recomputeLobby(state, now)
      } else {
        // Mid-game a player keeps their role and clues; they are only marked away.
        player.connected = false
        if (state.phase === 'FINAL_SEQUENCE' && everyoneHolding(state, now)) completeGame(state, now)
      }
      return { state, result: ok({}) }
    }

    case 'room:ready': {
      if (!inLobby(state)) return { state, result: fail('wrong_phase', 'The mission has already started') }
      player.isReady = command.ready
      recomputeLobby(state, now)
      return { state, result: ok(room()) }
    }

    case 'game:start': {
      if (!isHost) return { state, result: fail('not_host', 'Only the host can start the mission') }
      if (state.phase === 'LOBBY') {
        const connected = state.players.filter((p) => p.connected).length
        return connected < MIN_PLAYERS
          ? { state, result: fail('not_enough_players', `Need at least ${MIN_PLAYERS} players`) }
          : { state, result: fail('wrong_phase', 'Everyone must be ready first') }
      }
      if (state.phase !== 'READY') return { state, result: fail('wrong_phase', 'The mission has already started') }
      const roles = shuffle(ROLE_IDS, ctx.random)
      state.players.forEach((p, i) => {
        p.role = roles[i]
        emit(state!, { type: 'player:role', playerId: p.id, role: roles[i] }, now)
      })
      state.clues = dealPuzzle1Clues(state.players.map((p) => p.id))
      setPhase(state, 'INTRO', now)
      return { state, result: ok(room()) }
    }

    case 'game:reset': {
      if (!isHost) return { state, result: fail('not_host', 'Only the host can reset the mission') }
      for (const p of state.players) {
        p.isReady = false
        delete p.role
      }
      state.systems = { breaker: false, terminal: false, door: false }
      state.puzzles = freshProgress()
      state.clues = {}
      state.puzzle2 = null
      state.final = null
      delete state.narration
      setPhase(state, 'LOBBY', now)
      recomputeLobby(state, now)
      return { state, result: ok(room()) }
    }

    case 'intro:skip': {
      if (!isHost) return { state, result: fail('not_host', 'Only the host can skip the intro') }
      if (state.phase !== 'INTRO') return { state, result: fail('wrong_phase', 'The intro is not playing') }
      setPhase(state, 'PUZZLE_1', now)
      return { state, result: ok(room()) }
    }

    case 'puzzle:submit':
      return command.puzzle === 1 ? submitPuzzle1(state, command, now) : submitPuzzle2(state, command, now)

    case 'puzzle2:draft': {
      if (state.phase !== 'PUZZLE_2' || !state.puzzle2) {
        return { state, result: fail('wrong_phase', 'The boot terminal is not active') }
      }
      // Keep known module ids only, first occurrence wins, at most one of each.
      const known = command.order.filter((m): m is ModuleId => (MODULES as readonly string[]).includes(m))
      state.puzzle2.draft = [...new Set(known)].slice(0, MODULES.length)
      return { state, result: ok(room()) }
    }

    case 'final:press': {
      if (state.phase !== 'FINAL_SEQUENCE' || !state.final) {
        return { state, result: fail('wrong_phase', 'The blast door is not ready') }
      }
      state.final.holds[player.id] = command.held ? { held: true } : { held: false, releasedAt: now }
      if (everyoneHolding(state, now)) completeGame(state, now)
      return { state, result: ok(room()) }
    }

    case 'final:force': {
      if (!isHost) return { state, result: fail('not_host', 'Only the host can force the door') }
      if (state.phase !== 'FINAL_SEQUENCE') return { state, result: fail('wrong_phase', 'The blast door is not ready') }
      const waitMs = state.phaseStartedAt + FINAL_FORCE_AFTER_MS - now
      if (waitMs > 0) return { state, result: fail('cooldown', 'Keep trying together first', waitMs) }
      completeGame(state, now)
      return { state, result: ok(room()) }
    }
  }
}

function submitResult(state: GameState, solved: boolean, reason?: string, retryAfterMs?: number): GameResult {
  const data: SubmitData = { solved, room: toView(state) }
  if (reason) data.reason = reason
  if (retryAfterMs !== undefined) data.retryAfterMs = retryAfterMs
  return ok(data)
}

function submitPuzzle1(
  state: GameState,
  command: Extract<EngineCommand, { type: 'puzzle:submit' }>,
  now: number,
): { state: GameState; result: GameResult } {
  if (state.phase !== 'PUZZLE_1') return { state, result: fail('wrong_phase', 'The breaker puzzle is not active') }
  const check = checkPuzzle1(command.scanned, command.manualCode)
  if (check.kind === 'invalid') return { state, result: fail('bad_request', check.message) }
  const progress = state.puzzles[1]
  if (check.kind === 'wrong') {
    progress.attempts += 1
    progress.lastFailure = check.reason
    emit(state, { type: 'puzzle:failed', puzzle: 1, reason: check.reason }, now)
    return { state, result: submitResult(state, false, check.reason) }
  }
  progress.solved = true
  delete progress.lastFailure
  state.systems.breaker = true
  emit(state, { type: 'puzzle:verified', puzzle: 1 }, now)
  setPhase(state, 'PUZZLE_1_COMPLETE', now)
  return { state, result: submitResult(state, true) }
}

function submitPuzzle2(
  state: GameState,
  command: Extract<EngineCommand, { type: 'puzzle:submit' }>,
  now: number,
): { state: GameState; result: GameResult } {
  const p2 = state.puzzle2
  if (state.phase !== 'PUZZLE_2' || !p2) return { state, result: fail('wrong_phase', 'The boot terminal is not active') }
  const progress = state.puzzles[2]
  if (progress.retryAt !== undefined && now < progress.retryAt) {
    return { state, result: fail('cooldown', 'Terminal is rebooting', progress.retryAt - now) }
  }
  const check = checkOrder(p2.solution, command.order)
  if (!check.ok && check.reason === 'invalid') {
    return { state, result: fail('bad_request', 'Use each of the four modules exactly once') }
  }
  if (!check.ok) {
    progress.attempts += 1
    const reason = 'Sequence rejected'
    const cooldown = PUZZLE2_COOLDOWNS_MS[Math.min(progress.attempts - 1, PUZZLE2_COOLDOWNS_MS.length - 1)]
    progress.lastFailure = reason
    progress.retryAt = now + cooldown
    emit(state, { type: 'puzzle:failed', puzzle: 2, reason, retryAfterMs: cooldown }, now)
    // Anti-deadlock: release public hints after repeated failures.
    while (p2.released < p2.hints.length && progress.attempts >= PUZZLE2_HINT_AFTER_ATTEMPTS[p2.released]) {
      emit(state, { type: 'puzzle2:hint', text: p2.hints[p2.released] }, now)
      p2.released += 1
    }
    return { state, result: submitResult(state, false, reason, cooldown) }
  }
  progress.solved = true
  delete progress.lastFailure
  delete progress.retryAt
  state.systems.terminal = true
  emit(state, { type: 'puzzle:verified', puzzle: 2 }, now)
  setPhase(state, 'PUZZLE_2_COMPLETE', now)
  return { state, result: submitResult(state, true) }
}
