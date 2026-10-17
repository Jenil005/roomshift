/**
 * Client helpers for the game API. Use these from pages under src/pages/(app)/.
 *
 *   const res = await gameRequest<CreateData>({ type: 'room:create', playerName })
 *   if (res.ok) saveSession({ code: res.data.code, playerId: res.data.playerId, playerToken: res.data.playerToken })
 *   const room = useRoomView(session?.code)   // live public state, works signed out
 *   useHeartbeat(session)                      // keeps `connected` true while the page is open
 *
 * Private clues are never in `room`; fetch them with { type: 'room:me' } after the
 * phase leaves READY (and again after a reload).
 */

import { useEffect } from 'react'
import { useQuery } from 'deepspace'
import { HEARTBEAT_INTERVAL_MS } from '@shared/constants'
import type { ClientEvent, GameResult } from '@shared/events'
import type { Room } from '@shared/types'

export interface GameSession {
  code: string
  playerId: string
  playerToken: string
}

const SESSION_KEY = 'roomshift.session'

/** POST /api/game. Adds code + playerToken from `session` when given. Never throws. */
export async function gameRequest<T = unknown>(event: ClientEvent, session?: GameSession | null): Promise<GameResult<T>> {
  const body = session ? { code: session.code, playerToken: session.playerToken, ...event } : event
  try {
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json()) as GameResult<T>
  } catch {
    return { ok: false, code: 'server_error', message: 'Network error. Check your connection.' }
  }
}

export function loadSession(): GameSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as GameSession) : null
  } catch {
    return null
  }
}

export function saveSession(session: GameSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Private mode or blocked storage: the game still works until the page reloads.
  }
}

/** Live public room state from the `rs_rooms` mirror. null while loading or if the room is gone. */
export function useRoomView(code: string | null | undefined): Room | null {
  const { records } = useQuery<{ code: string; view: Room }>('rs_rooms', { where: { code: code ?? '' } })
  return code ? (records[0]?.data.view ?? null) : null
}

/** Sends player:heartbeat on an interval and immediately when the tab becomes visible again. */
export function useHeartbeat(session: GameSession | null): void {
  useEffect(() => {
    if (!session) return
    const beat = () => void gameRequest({ type: 'player:heartbeat' }, session)
    beat()
    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session])
}
