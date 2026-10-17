/**
 * Puzzle 1 (physical object order), content from docs/game-flow.md.
 * The solution stays server-side; players only receive their own clue lines.
 */

import { OBJECT_IDS, PUZZLE1_HOLD_MS } from '@shared/constants'
import type { ObjectId, PhysicalEvidence } from '@shared/types'

export const PUZZLE1_SOLUTION: readonly ObjectId[] = ['book', 'cup', 'keys']

// Manual fallback when the camera fails: the objects' first letters in order, e.g. "BCK".
const INITIALS: Record<string, ObjectId> = { B: 'book', C: 'cup', K: 'keys' }

// Normalized image coordinates may sit slightly outside [0, 1] at the frame edge.
const COORD_MIN = -0.05
const COORD_MAX = 1.05

export type VerifiedBy = 'camera' | 'manual'

export type Puzzle1Check =
  | { kind: 'solved'; verifiedBy: VerifiedBy }
  | { kind: 'wrong'; reason: string } // valid attempt, counts as a failure
  | { kind: 'invalid'; message: string } // malformed input, not counted

export interface Puzzle1Input {
  physical?: PhysicalEvidence // the AR module's PhysicalPuzzleResult
  scanned?: readonly string[] // QR scan sequence, left to right
  manualCode?: string
}

const normalizeId = (id: string) => id.trim().toLowerCase()

/** Turns camera evidence into a left-to-right order using the marker centers only. */
function orderFromMarkers(markers: NonNullable<PhysicalEvidence['markers']>): string[] | { invalid: string } {
  if (markers.length === 0) return { invalid: 'Camera evidence has no markers' }
  for (const m of markers) {
    const { x, y } = m.center
    if (![x, y].every((v) => Number.isFinite(v) && v >= COORD_MIN && v <= COORD_MAX)) {
      return { invalid: 'Marker position out of range' }
    }
  }
  return [...markers].sort((a, b) => a.center.x - b.center.x).map((m) => normalizeId(m.id))
}

/**
 * Verifies a physical arrangement. Precedence: AR evidence, then a scan sequence, then a
 * manual code. The client's "solved" opinion and, for camera evidence, its claimed order
 * are never consulted.
 */
export function checkPuzzle1({ physical, scanned, manualCode }: Puzzle1Input): Puzzle1Check {
  let order: string[]
  let verifiedBy: VerifiedBy
  if (physical) {
    verifiedBy = physical.source
    if (physical.source === 'camera') {
      if (!physical.markers) return { kind: 'invalid', message: 'Camera evidence needs marker positions' }
      const derived = orderFromMarkers(physical.markers)
      if (!Array.isArray(derived)) return { kind: 'invalid', message: derived.invalid }
      order = derived
    } else {
      order = (physical.order ?? []).map(normalizeId)
    }
  } else if (scanned && scanned.length > 0) {
    verifiedBy = 'camera'
    order = scanned.map(normalizeId)
  } else if (manualCode && manualCode.trim()) {
    verifiedBy = 'manual'
    const letters = manualCode.toUpperCase().replace(/[^A-Z]/g, '')
    if (![...letters].every((l) => l in INITIALS)) return { kind: 'wrong', reason: 'Code rejected' }
    order = [...letters].map((l) => INITIALS[l])
  } else {
    return { kind: 'invalid', message: 'Send AR evidence, scanned objects or a manual code' }
  }

  if (!order.every((id) => (OBJECT_IDS as readonly string[]).includes(id))) {
    return { kind: 'invalid', message: 'Unknown object id' }
  }
  if (new Set(order).size !== order.length) return { kind: 'invalid', message: 'Each object may appear once' }
  if (order.length < PUZZLE1_SOLUTION.length) return { kind: 'wrong', reason: 'Not all objects detected' }
  if (!order.every((id, i) => id === PUZZLE1_SOLUTION[i])) return { kind: 'wrong', reason: 'Wrong order' }
  if (physical?.source === 'camera' && (physical.heldForMs ?? 0) < PUZZLE1_HOLD_MS) {
    return { kind: 'wrong', reason: 'Hold the objects steady' }
  }
  return { kind: 'solved', verifiedBy }
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
