/**
 * Gemini narration: one short atmospheric line per phase. Flavor only.
 *
 * The prompt is built from public room state only: no clues, no solutions, no player
 * names (names are user input and could carry prompt injection). Gemini therefore cannot
 * leak an answer, and its output never decides anything: GameRoom stores it as text,
 * and only if the room is still in the phase it was written for.
 */

import type { GamePhase, Room } from '@shared/types'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
export const NARRATION_TIMEOUT_MS = 6_000
const MAX_CHARS = 240
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const MOMENT: Record<GamePhase, string> = {
  LOBBY: 'The team is gathering in the lobby.',
  READY: 'Every operative has reported ready.',
  INTRO: 'The mission begins: the facility has lost power and will lock down permanently.',
  PUZZLE_1: 'The team must restore the breaker by physically arranging three objects in the room.',
  PUZZLE_1_COMPLETE: 'The breaker has just been restored; emergency power returns.',
  PUZZLE_2: 'The comms terminal needs its four modules booted in the right order; each operative holds part of the record.',
  PUZZLE_2_COMPLETE: 'The comms stack has just come online.',
  FINAL_SEQUENCE: 'Only the blast door remains; every operative must hold the override at the same moment.',
  COMPLETE: 'The team has escaped: power restored, lockdown lifted.',
}

const SYSTEM_INSTRUCTION = [
  'You are the mission-control voice of "Blackout Protocol", a cooperative escape game played',
  'in a real room. Write one or two short sentences (at most 35 words) of tense, atmospheric',
  'narration for the moment described. Speak to the team as "operatives".',
  'Never give hints, answers, codes, orders of objects or modules, or instructions.',
  'Never invent names. Plain text only: no markdown, no quotation marks, no emoji.',
].join(' ')

export interface NarrationContext {
  phase: GamePhase
  teamSize: number
  roles: string[]
  systemsOnline: string[]
  failedAttempts: number // on the puzzle just finished or in progress
}

/** Public, secret-free facts for the prompt. */
export function narrationContext(room: Room): NarrationContext {
  const puzzle = room.phase.startsWith('PUZZLE_2') ? 2 : 1
  return {
    phase: room.phase,
    teamSize: room.players.length,
    roles: room.players.flatMap((p) => (p.role ? [p.role] : [])),
    systemsOnline: (Object.keys(room.systems) as (keyof Room['systems'])[]).filter((k) => room.systems[k]),
    failedAttempts: room.puzzles[puzzle].attempts,
  }
}

export function buildPrompt(ctx: NarrationContext): string {
  return [
    `Moment: ${MOMENT[ctx.phase]}`,
    `Team size: ${ctx.teamSize}. Roles: ${ctx.roles.join(', ') || 'unassigned'}.`,
    `Systems online: ${ctx.systemsOnline.join(', ') || 'none'}.`,
    ctx.failedAttempts > 0 ? `The team has failed ${ctx.failedAttempts} attempt(s) so far; tension is rising.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Normalizes model output into one short plain line, or null if unusable. */
export function cleanNarration(raw: string): string | null {
  let text = raw
    .replace(/[*_#`"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  if (text.length > MAX_CHARS) {
    const cut = text.slice(0, MAX_CHARS)
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
    text = lastStop > 40 ? cut.slice(0, lastStop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}...`
  }
  return text
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
}

/**
 * Calls the Gemini REST API. Returns null on any failure (no key, timeout, HTTP error,
 * empty or unusable output); callers keep the fallback line. Never throws.
 */
export async function generateNarration(
  apiKey: string,
  model: string,
  ctx: NarrationContext,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(ctx) }] }],
        // Roomy budget: thinking tokens count against it on 3.x models.
        generationConfig: { temperature: 0.9, maxOutputTokens: 512 },
      }),
      signal: AbortSignal.timeout(NARRATION_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[narration] gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const json = (await res.json()) as GeminiResponse
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join(' ')
    return cleanNarration(text)
  } catch (err) {
    console.error(`[narration] gemini failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
