/**
 * Puzzle 1 (physical object order), content from docs/game-flow.md.
 * The solution stays server-side; players only receive their own clue lines.
 */

import type { ObjectId } from '@shared/types'

export const PUZZLE1_SOLUTION: readonly ObjectId[] = ['book', 'cup', 'keys']

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
