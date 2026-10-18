/**
 * Puzzle 1 (physical object sequence), content from docs/game-flow.md.
 * The solution stays server-side; players only receive their own clue lines.
 *
 * Camera play scans one object at a time (puzzle1:scan): each newly recognized object is
 * checked against the next position of the sequence as it arrives. A manual report
 * (puzzle:submit) sends the whole sequence at once and is recorded as manual evidence.
 */

import { OBJECT_IDS, PUZZLE1_SCAN_MIN_CONFIDENCE } from '@shared/constants'
import type { ObjectId, ObjectScan, PhysicalEvidence } from '@shared/types'

export const PUZZLE1_SOLUTION: readonly ObjectId[] = ['book', 'cup', 'keyboard']

const LABEL: Record<ObjectId, string> = { book: 'BOOK', cup: 'CUP', keyboard: 'KEYBOARD' }

// Manual fallback when the camera fails: the objects' first letters in order, e.g. "BCK".
const INITIALS: Record<string, ObjectId> = { B: 'book', C: 'cup', K: 'keyboard' }

export type VerifiedBy = 'camera' | 'manual'

export type Puzzle1Check =
  | { kind: 'solved'; verifiedBy: VerifiedBy }
  | { kind: 'wrong'; reason: string } // valid attempt, counts as a failure
  | { kind: 'invalid'; message: string } // malformed input, not counted

export interface Puzzle1Input {
  physical?: PhysicalEvidence // the AR module's manual report
  manualCode?: string
}

const normalizeId = (id: string) => id.trim().toLowerCase()

export function toObjectId(raw: string): ObjectId | null {
  const id = normalizeId(raw)
  return (OBJECT_IDS as readonly string[]).includes(id) ? (id as ObjectId) : null
}

/** Checks a whole manually reported sequence. Precedence: AR manual report, then typed code. */
export function checkPuzzle1({ physical, manualCode }: Puzzle1Input): Puzzle1Check {
  let order: string[]
  if (physical) {
    order = physical.order.map(normalizeId)
  } else if (manualCode && manualCode.trim()) {
    const letters = manualCode.toUpperCase().replace(/[^A-Z]/g, '')
    if (![...letters].every((l) => l in INITIALS)) return { kind: 'wrong', reason: 'Code rejected' }
    order = [...letters].map((l) => INITIALS[l])
  } else {
    return { kind: 'invalid', message: 'Scan the objects, or send a manual report' }
  }

  if (!order.every((id) => toObjectId(id) !== null)) return { kind: 'invalid', message: 'Unknown object id' }
  if (new Set(order).size !== order.length) return { kind: 'invalid', message: 'Each object may appear once' }
  if (order.length < PUZZLE1_SOLUTION.length) return { kind: 'wrong', reason: 'Not all objects reported' }
  if (!order.every((id, i) => id === PUZZLE1_SOLUTION[i])) return { kind: 'wrong', reason: 'Wrong order' }
  return { kind: 'solved', verifiedBy: 'manual' }
}

export type ScanCheck =
  | { kind: 'duplicate'; object: ObjectId } // already scanned in this attempt; nothing changes
  | { kind: 'accepted'; object: ObjectId; complete: boolean } // the next object of the sequence
  | { kind: 'wrong'; object: ObjectId; reason: string } // out of sequence: a failed attempt
  | { kind: 'invalid'; message: string } // malformed or below the confidence floor, not counted

export interface ScanInput {
  object: string
  source: 'ai' | 'qr'
  confidence?: number
}

/**
 * Judges one scan against the attempt's accepted scans. The client's detection is taken as
 * gameplay input: the server checks it is well formed, above the confidence floor, new, and
 * the next object of the sequence. It cannot check that a camera really saw the object.
 */
export function checkScan(scan: ScanInput, accepted: readonly ObjectScan[]): ScanCheck {
  const object = toObjectId(scan.object)
  if (!object) return { kind: 'invalid', message: 'Unknown object id' }
  if (scan.source === 'ai') {
    const c = scan.confidence
    if (typeof c !== 'number' || !Number.isFinite(c) || c > 1) {
      return { kind: 'invalid', message: 'AI scans need a detector confidence between 0 and 1' }
    }
    if (c < PUZZLE1_SCAN_MIN_CONFIDENCE) return { kind: 'invalid', message: 'Detection confidence too low' }
  }
  if (accepted.some((s) => s.object === object)) return { kind: 'duplicate', object }
  if (PUZZLE1_SOLUTION[accepted.length] !== object) {
    return { kind: 'wrong', object, reason: `${LABEL[object]} scanned out of sequence` }
  }
  return { kind: 'accepted', object, complete: accepted.length + 1 === PUZZLE1_SOLUTION.length }
}

// Together the first three clues pin down exactly BOOK -> CUP -> KEYBOARD, the scan sequence.
// The fourth is only dealt in a 4-player game so everyone holds at least one line.
const CLUES = [
  'Knowledge is scanned before containment.',
  'Access is scanned last.',
  'Containment is scanned between the other two.',
  'Knowledge is scanned first.',
] as const

/** Deal clues round-robin in player order. Every player gets at least one. */
export function dealPuzzle1Clues(playerIds: readonly string[]): Record<string, string[]> {
  const pool = playerIds.length >= 4 ? CLUES : CLUES.slice(0, 3)
  const dealt: Record<string, string[]> = {}
  for (const id of playerIds) dealt[id] = []
  pool.forEach((clue, i) => dealt[playerIds[i % playerIds.length]].push(clue))
  return dealt
}
