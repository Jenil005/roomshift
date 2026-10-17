/**
 * GameRoom: one Durable Object per room code, the single authority for that game.
 *
 * Every command runs inside blockConcurrencyWhile, so commands for a room are applied
 * strictly one at a time (two players pressing at once can never interleave). After a
 * change the public view is mirrored into the app RecordRoom's `rs_rooms` collection,
 * which DeepSpace syncs live to every phone. Timers use the DO alarm.
 */

import type { GameResult } from '@shared/events'
import type { Env } from '../../worker'
import { nextDeadline, reduce, toView, type EngineCommand, type GameState } from './engine'

const STATE_KEY = 'game'
const MIRRORED_KEY = 'mirroredVersion'
const MIN_ALARM_DELAY_MS = 250

export class GameRoom implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const command = (await request.json()) as EngineCommand
    const result = await this.ctx.blockConcurrencyWhile(() => this.run(command))
    return Response.json(result)
  }

  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(() => this.run({ type: 'tick' }))
  }

  private async run(command: EngineCommand): Promise<GameResult> {
    const storage = this.ctx.storage
    const prev = (await storage.get<GameState>(STATE_KEY)) ?? null
    const now = Date.now()
    const { state, result, viewChanged } = reduce(prev, command, { now, random: Math.random })

    // Timer ticks and view polls only log when they changed something.
    if ((command.type !== 'tick' && command.type !== 'room:view') || viewChanged) {
      const outcome = result.ok ? 'ok' : result.code
      console.info(`[game] ${state?.code ?? prev?.code ?? '-'} ${command.type} -> ${outcome} v${state?.version ?? '-'}`)
    }

    if (state) {
      await storage.put(STATE_KEY, state)
      // Mirror when the view changed, or retry a mirror that failed earlier.
      const mirrored = (await storage.get<number>(MIRRORED_KEY)) ?? -1
      if (viewChanged || mirrored !== state.version) {
        if (await this.mirror(state.code, state)) await storage.put(MIRRORED_KEY, state.version)
      }
      const deadline = nextDeadline(state)
      if (deadline === null) await storage.deleteAlarm()
      else await storage.setAlarm(Math.max(deadline, now + MIN_ALARM_DELAY_MS))
    } else if (prev) {
      // Room ended (everyone left or idle timeout): drop all storage and the public record.
      await storage.deleteAlarm()
      await storage.deleteAll()
      await this.mirror(prev.code, null)
    }
    return result
  }

  /** Upserts (or deletes) the public `rs_rooms` record. Returns false on failure. */
  private async mirror(code: string, state: GameState | null): Promise<boolean> {
    const env = this.env
    const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
    const body = state
      ? {
          tool: 'records.create',
          params: {
            collection: 'rs_rooms',
            recordId: code,
            data: { code, phase: state.phase, version: state.version, view: toView(state) },
          },
        }
      : { tool: 'records.delete', params: { collection: 'rs_rooms', recordId: code } }
    try {
      const res = await stub.fetch(
        new Request('https://internal/api/tools/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': env.OWNER_USER_ID,
            'X-App-Action': 'true',
          },
          body: JSON.stringify(body),
        }),
      )
      const json = (await res.json()) as { success?: boolean; error?: string }
      if (!json.success) {
        console.error(`[game] ${code} mirror failed: ${json.error ?? res.status}`)
        return false
      }
      return true
    } catch (err) {
      console.error(`[game] ${code} mirror threw: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }
}
