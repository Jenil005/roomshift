import { describe, expect, it } from 'vitest'
import { PUZZLE1_HOLD_MS } from '@shared/constants'
import type { PhysicalEvidence } from '@shared/types'
import { checkPuzzle1 } from './puzzle1'

// Mirrors ar/physicalOrder.ts toCameraResult(): uppercase ids, normalized centers.
const marker = (id: string, x: number, y = 0.5) => ({ id, center: { x, y } })
const camera = (markers: PhysicalEvidence['markers'], heldForMs = PUZZLE1_HOLD_MS, order?: string[]): PhysicalEvidence => ({
  source: 'camera',
  markers,
  heldForMs,
  ...(order ? { order } : {}),
})

describe('checkPuzzle1 with AR camera evidence', () => {
  it('derives the order from marker x positions, regardless of array order or id case', () => {
    const evidence = camera([marker('KEYS', 0.8), marker('BOOK', 0.15), marker('CUP', 0.5)])
    expect(checkPuzzle1({ physical: evidence })).toEqual({ kind: 'solved', verifiedBy: 'camera' })
  })

  it('ignores a claimed order that the marker positions contradict', () => {
    const evidence = camera([marker('CUP', 0.1), marker('BOOK', 0.5), marker('KEYS', 0.9)], PUZZLE1_HOLD_MS, [
      'BOOK',
      'CUP',
      'KEYS',
    ])
    expect(checkPuzzle1({ physical: evidence })).toEqual({ kind: 'wrong', reason: 'Wrong order' })
  })

  it('requires the steady hold', () => {
    const evidence = camera([marker('BOOK', 0.1), marker('CUP', 0.5), marker('KEYS', 0.9)], PUZZLE1_HOLD_MS - 1)
    expect(checkPuzzle1({ physical: evidence })).toEqual({ kind: 'wrong', reason: 'Hold the objects steady' })
  })

  it('counts a missing object as a failed attempt', () => {
    const evidence = camera([marker('BOOK', 0.1), marker('CUP', 0.5)])
    expect(checkPuzzle1({ physical: evidence })).toEqual({ kind: 'wrong', reason: 'Not all objects detected' })
  })

  it('rejects malformed evidence without counting it', () => {
    const cases: PhysicalEvidence[] = [
      { source: 'camera', heldForMs: 2000 }, // no markers
      camera([]),
      camera([marker('BOOK', 0.1), marker('PHONE', 0.5), marker('KEYS', 0.9)]),
      camera([marker('BOOK', 0.1), marker('BOOK', 0.5), marker('KEYS', 0.9)]),
      camera([marker('BOOK', Number.NaN), marker('CUP', 0.5), marker('KEYS', 0.9)]),
      camera([marker('BOOK', 0.1), marker('CUP', 7), marker('KEYS', 0.9)]),
    ]
    for (const physical of cases) expect(checkPuzzle1({ physical }).kind).toBe('invalid')
  })
})

describe('checkPuzzle1 fallbacks', () => {
  it('accepts the AR manual mode order and records it as manual', () => {
    expect(checkPuzzle1({ physical: { source: 'manual', order: ['BOOK', 'CUP', 'KEYS'] } })).toEqual({
      kind: 'solved',
      verifiedBy: 'manual',
    })
    expect(checkPuzzle1({ physical: { source: 'manual', order: ['CUP', 'BOOK', 'KEYS'] } })).toEqual({
      kind: 'wrong',
      reason: 'Wrong order',
    })
  })

  it('treats a QR scan sequence as camera and a typed code as manual', () => {
    expect(checkPuzzle1({ scanned: ['book', 'CUP', 'Keys'] })).toEqual({ kind: 'solved', verifiedBy: 'camera' })
    expect(checkPuzzle1({ manualCode: 'bck' })).toEqual({ kind: 'solved', verifiedBy: 'manual' })
  })

  it('prefers AR evidence over the other fields', () => {
    const wrongCamera = camera([marker('KEYS', 0.1), marker('CUP', 0.5), marker('BOOK', 0.9)])
    expect(checkPuzzle1({ physical: wrongCamera, scanned: ['book', 'cup', 'keys'] }).kind).toBe('wrong')
  })
})
