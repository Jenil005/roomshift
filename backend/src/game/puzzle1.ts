/**
 * Puzzle 1 (physical object order), content from docs/game-flow.md.
 * The solution stays server-side; players only receive their own clue lines.
 */

import { OBJECT_IDS } from '@shared/constants'
import type { ObjectId } from '@shared/types'

export const PUZZLE1_SOLUTION: readonly ObjectId[] = ['book', 'cup', 'keys']

// Manual fallback when the camera fails: the objects' first letters in order, e.g. "BCK".
const INITIALS: Record<string, ObjectId> = { B: 'book', C: 'cup', K: 'keys' }

export type Puzzle1Check =
  | { kind: 'solved' }
  | { kind: 'wrong'; reason: string } // valid attempt, counts as a failure
  | { kind: 'invalid'; message: string } // malformed input, not counted

/**
 * Verifies a scan (left-to-right object ids from the AR module) or a manual code.
 * The client's opinion of "solved" is never consulted; only the order is compared.
 */
export function checkPuzzle1(scanned: readonly string[] | undefined, manualCode: string | undefined): Puzzle1Check {
  let order: string[]
  if (scanned && scanned.length > 0) {
    order = [...scanned]
  } else if (manualCode && manualCode.trim()) {
    const letters = manualCode.toUpperCase().replace(/[^A-Z]/g, '')
    if (![...letters].every((l) => l in INITIALS)) return { kind: 'wrong', reason: 'Code rejected' }
    order = [...letters].map((l) => INITIALS[l])
  } else {
    return { kind: 'invalid', message: 'Send scanned objects or a manual code' }
  }
  if (!order.every((id) => (OBJECT_IDS as readonly string[]).includes(id))) {
    return { kind: 'invalid', message: 'Unknown object id' }
  }
  if (new Set(order).size !== order.length) return { kind: 'invalid', message: 'Each object may appear once' }
  if (order.length < PUZZLE1_SOLUTION.length) return { kind: 'wrong', reason: 'Not all objects detected' }
  return order.every((id, i) => id === PUZZLE1_SOLUTION[i]) ? { kind: 'solved' } : { kind: 'wrong', reason: 'Wrong order' }
}

// Together the first three clues pin down exactly BOOK -> CUP -> KEYS.
// The fourth is only dealt in a 4-player game so everyone holds at least one line.
const CLUES = [
  'Knowledge comes before containment.',
  'Access comes last.',
  'Containment is between the other two.',
  'Knowledge comes first.',
] as const

/** Deal clues round-robin in player order. Every player gets at least one. */
export function dealPuzzle1Clues(playerIds: readonly string[]): Record<string, string[]> {
  const pool = playerIds.length >= 4 ? CLUES : CLUES.slice(0, 3)
  const dealt: Record<string, string[]> = {}
  for (const id of playerIds) dealt[id] = []
  pool.forEach((clue, i) => dealt[playerIds[i % playerIds.length]].push(clue))
  return dealt
}
