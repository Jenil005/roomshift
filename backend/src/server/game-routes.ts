/**
 * Public game API: POST /api/game with a `GameRequest` body (see shared/events).
 *
 * DeepSpace has no guest accounts and anonymous sockets are read-only, so players are
 * identified by a bearer `playerToken` minted here on create/join. This route is the
 * trust boundary: it validates the body, hashes the token (the GameRoom only ever sees
 * the hash), and forwards one command to the room's Durable Object. Client-sent
 * identity fields (playerId, roomCode inside submissions) are ignored.
 */

import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import type { GameErrorCode, GameResult } from '@shared/events'
import type { AppContext, Env } from '../../worker.js'
import { CODE_TAKEN_MESSAGE, type EngineCommand, type JoinResultData } from '../game/engine.js'
import { hashToken, newPlayerId, newPlayerToken, newRoomCode, normalizeRoomCode } from '../game/ids.js'
import { RateLimiter } from '../game/rateLimit.js'

const MAX_BODY_BYTES = 4096
const CREATE_ATTEMPTS = 5

// Per-IP, per-isolate abuse limits. Generous: a whole venue may share one public IP.
// Exact per-player limits are enforced inside each GameRoom.
const ipLimit = new RateLimiter({ capacity: 120, refillPerSec: 30 })
const createLimit = new RateLimiter({ capacity: 10, refillPerSec: 1 / 6 })

const STATUS: Record<GameErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  not_in_room: 401,
  not_host: 403,
  room_not_found: 404,
  room_full: 409,
  game_started: 409,
  name_taken: 409,
  wrong_phase: 409,
  not_enough_players: 409,
  cooldown: 429,
  rate_limited: 429,
  not_implemented: 501,
  server_error: 500,
}

const name = z.string().min(1).max(60)
const token = z.string().min(16).max(128)
const authed = { code: z.string().max(16), playerToken: token }

const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room:create'), playerName: name }),
  z.object({ type: z.literal('room:join'), code: z.string().max(16), playerName: name, playerToken: token.optional() }),
  z.object({ type: z.literal('room:leave'), ...authed }),
  z.object({ type: z.literal('room:ready'), ready: z.boolean(), ...authed }),
  z.object({ type: z.literal('game:start'), ...authed }),
  z.object({ type: z.literal('intro:skip'), ...authed }),
  z.object({ type: z.literal('player:heartbeat'), ...authed }),
  z.object({ type: z.literal('room:me'), ...authed }),
  z.object({
    type: z.literal('puzzle:submit'),
    submission: z.object({
      puzzle: z.union([z.literal(1), z.literal(2)]),
      // Puzzle 1 manual report only (camera scans use puzzle1:scan); unknown keys are stripped.
      physical: z
        .object({
          source: z.literal('manual'),
          order: z.array(z.string().max(32)).max(8),
        })
        .optional(),
      manualCode: z.string().max(32).optional(),
      order: z.array(z.string().max(32)).max(8).optional(),
    }),
    ...authed,
  }),
  z.object({
    type: z.literal('puzzle1:scan'),
    scan: z.object({
      object: z.string().max(32),
      source: z.enum(['ai', 'qr']),
      confidence: z.number().min(0).max(1).optional(),
    }),
    ...authed,
  }),
  z.object({ type: z.literal('puzzle1:restart'), ...authed }),
  z.object({ type: z.literal('puzzle2:draft'), order: z.array(z.string().max(32)).max(8), ...authed }),
  z.object({ type: z.literal('final:press'), held: z.boolean(), ...authed }),
  z.object({ type: z.literal('final:force'), ...authed }),
  z.object({ type: z.literal('game:reset'), ...authed }),
])

const fail = (code: GameErrorCode, message: string): GameResult => ({ ok: false, code, message })

function reply(c: { json: (body: unknown, status: ContentfulStatusCode) => Response }, result: GameResult) {
  return c.json(result, result.ok ? 200 : STATUS[result.code])
}

async function send(env: Env, code: string, command: EngineCommand): Promise<GameResult> {
  try {
    const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code))
    const res = await stub.fetch('https://game-room/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    })
    return (await res.json()) as GameResult
  } catch (err) {
    // A room that is restarting or overloaded must still answer in the GameResult shape.
    console.error(`[game] ${code} ${command.type} unreachable: ${err instanceof Error ? err.message : String(err)}`)
    return fail('server_error', 'The room is not responding, try again')
  }
}

function limited(waitMs: number): GameResult {
  return { ok: false, code: 'rate_limited', message: 'Too many requests, slow down', retryAfterMs: waitMs }
}

const clientIp = (req: Request) => req.headers.get('CF-Connecting-IP') ?? 'local'

export function registerGameRoutes(app: Hono<AppContext>): void {
  // Public room view for pages that cannot use DeepSpace hooks (the plain-JS AR room page).
  // React pages should prefer useRoomView(), which is pushed live instead of polled.
  app.get('/api/game/room/:code', async (c) => {
    c.header('Cache-Control', 'no-store')
    const waitMs = ipLimit.take(clientIp(c.req.raw), Date.now())
    if (waitMs > 0) return reply(c, limited(waitMs))
    const code = normalizeRoomCode(c.req.param('code'))
    if (!code) return reply(c, fail('room_not_found', 'No room with that code'))
    return reply(c, await send(c.env, code, { type: 'room:view' }))
  })

  app.post('/api/game', async (c) => {
    const ip = clientIp(c.req.raw)
    const waitMs = ipLimit.take(ip, Date.now())
    if (waitMs > 0) return reply(c, limited(waitMs))
    const text = await c.req.text()
    if (text.length > MAX_BODY_BYTES) return reply(c, fail('bad_request', 'Request too large'))
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return reply(c, fail('bad_request', 'Body must be JSON'))
    }
    const parsed = requestSchema.safeParse(raw)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return reply(c, fail('bad_request', `Invalid request${issue ? `: ${issue.path.join('.')} ${issue.message}` : ''}`))
    }
    const req = parsed.data

    if (req.type === 'room:create') {
      const createWait = createLimit.take(ip, Date.now())
      if (createWait > 0) return reply(c, limited(createWait))
      const playerToken = newPlayerToken()
      const tokenHash = await hashToken(playerToken)
      const playerId = newPlayerId()
      for (let i = 0; i < CREATE_ATTEMPTS; i++) {
        const code = newRoomCode()
        const result = await send(c.env, code, { type: 'room:create', code, playerId, playerName: req.playerName, tokenHash })
        if (!result.ok && result.message === CODE_TAKEN_MESSAGE) continue
        return reply(c, withToken(result, playerToken))
      }
      console.error('[game] room:create could not find a free code')
      return reply(c, fail('server_error', 'Could not create a room, try again'))
    }

    const code = normalizeRoomCode(req.code)
    if (!code) return reply(c, fail('room_not_found', 'No room with that code'))

    if (req.type === 'room:join') {
      const playerToken = newPlayerToken()
      const rejoinTokenHash = req.playerToken ? await hashToken(req.playerToken) : undefined
      const result = await send(c.env, code, {
        type: 'room:join',
        playerId: newPlayerId(),
        playerName: req.playerName,
        tokenHash: await hashToken(playerToken),
        rejoinTokenHash,
      })
      // A rejoin keeps the token the client already holds.
      const rejoined = result.ok && (result.data as JoinResultData).rejoined
      return reply(c, withToken(result, rejoined ? req.playerToken! : playerToken))
    }

    const tokenHash = await hashToken(req.playerToken)
    return reply(c, await send(c.env, code, toCommand(req, tokenHash)))
  })
}

type AuthedRequest = Exclude<z.infer<typeof requestSchema>, { type: 'room:create' | 'room:join' }>

/** Copies only the validated payload fields; nothing else from the body reaches the room. */
function toCommand(req: AuthedRequest, tokenHash: string): EngineCommand {
  switch (req.type) {
    case 'room:ready':
      return { type: req.type, tokenHash, ready: req.ready }
    case 'puzzle:submit': {
      const { puzzle, physical, manualCode, order } = req.submission
      return { type: req.type, tokenHash, puzzle, physical, manualCode, order }
    }
    case 'puzzle1:scan': {
      const { object, source, confidence } = req.scan
      return { type: req.type, tokenHash, scan: { object, source, confidence } }
    }
    case 'puzzle2:draft':
      return { type: req.type, tokenHash, order: req.order }
    case 'final:press':
      return { type: req.type, tokenHash, held: req.held }
    default:
      return { type: req.type, tokenHash }
  }
}

function withToken(result: GameResult, playerToken: string): GameResult {
  if (!result.ok) return result
  const { rejoined: _rejoined, ...data } = result.data as JoinResultData
  return { ok: true, data: { ...data, playerToken } }
}
