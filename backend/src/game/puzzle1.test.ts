import { describe, expect, it } from 'vitest'
import { PUZZLE1_SCAN_MIN_CONFIDENCE } from '@shared/constants'
import type { ObjectId, ObjectScan } from '@shared/types'
import { checkPuzzle1, checkScan, dealPuzzle1Clues, PUZZLE1_SOLUTION } from './puzzle1'

const ai = (object: string, confidence = 0.8) => ({ object, source: 'ai' as const, confidence })
const accepted = (...objects: ObjectId[]): ObjectScan[] =>
  objects.map((object, i) => ({ object, source: 'ai', by: 'p0', at: i }))

describe('checkScan (one object at a time)', () => {
  it('accepts the sequence one object per scan, in any id case, and completes on the last', () => {
    expect(checkScan(ai('BOOK'), [])).toEqual({ kind: 'accepted', object: 'book', complete: false })
    expect(checkScan(ai('cup'), accepted('book'))).toEqual({ kind: 'accepted', object: 'cup', complete: false })
    expect(checkScan(ai('Keyboard'), accepted('book', 'cup'))).toEqual({
      kind: 'accepted',
      object: 'keyboard',
      complete: true,
    })
  })

  it('needs no other object in view: each scan is judged against accepted progress only', () => {
    // CUP after BOOK is accepted even though nothing about BOOK is sent with it.
    expect(checkScan({ object: 'cup', source: 'qr' }, accepted('book')).kind).toBe('accepted')
  })

  it('reports a repeat sighting as a duplicate instead of new progress', () => {
    expect(checkScan(ai('book'), accepted('book'))).toEqual({ kind: 'duplicate', object: 'book' })
    expect(checkScan(ai('book'), accepted('book', 'cup'))).toEqual({ kind: 'duplicate', object: 'book' })
  })

  it('rejects an out-of-sequence object as a failed attempt', () => {
    expect(checkScan(ai('cup'), [])).toEqual({ kind: 'wrong', object: 'cup', reason: 'CUP scanned out of sequence' })
    expect(checkScan(ai('keyboard'), accepted('book')).kind).toBe('wrong')
  })

  it('refuses low-confidence or malformed AI scans without counting them', () => {
    expect(checkScan(ai('book', PUZZLE1_SCAN_MIN_CONFIDENCE - 0.01), [])).toEqual({
      kind: 'invalid',
      message: 'Detection confidence too low',
    })
    expect(checkScan(ai('book', PUZZLE1_SCAN_MIN_CONFIDENCE), []).kind).toBe('accepted')
    expect(checkScan({ object: 'book', source: 'ai' }, []).kind).toBe('invalid') // no score
    expect(checkScan(ai('book', Number.NaN), []).kind).toBe('invalid')
    expect(checkScan(ai('book', 1.5), []).kind).toBe('invalid')
    expect(checkScan(ai('phone'), []).kind).toBe('invalid')
  })

  it('needs no QR code: an AI scan alone is complete evidence for every object', () => {
    let progress: ObjectScan[] = []
    for (const object of PUZZLE1_SOLUTION) {
      expect(checkScan(ai(object), progress).kind).toBe('accepted')
      progress = [...progress, ...accepted(object)]
    }
  })
})

describe('checkPuzzle1 manual fallback', () => {
  it('accepts the AR manual report and records it as manual', () => {
    expect(checkPuzzle1({ physical: { source: 'manual', order: ['BOOK', 'CUP', 'KEYBOARD'] } })).toEqual({
      kind: 'solved',
      verifiedBy: 'manual',
    })
    expect(checkPuzzle1({ physical: { source: 'manual', order: ['CUP', 'BOOK', 'KEYBOARD'] } })).toEqual({
      kind: 'wrong',
      reason: 'Wrong order',
    })
  })

  it('accepts a typed code as manual and rejects malformed input without counting it', () => {
    expect(checkPuzzle1({ manualCode: 'bck' })).toEqual({ kind: 'solved', verifiedBy: 'manual' })
    expect(checkPuzzle1({ manualCode: 'bc' })).toEqual({ kind: 'wrong', reason: 'Not all objects reported' })
    expect(checkPuzzle1({}).kind).toBe('invalid')
    expect(checkPuzzle1({ physical: { source: 'manual', order: ['book', 'book', 'cup'] } }).kind).toBe('invalid')
    expect(checkPuzzle1({ physical: { source: 'manual', order: ['book', 'phone', 'cup'] } }).kind).toBe('invalid')
  })
})

describe('puzzle 1 clues', () => {
  it('describe the scan sequence and give every player at least one line', () => {
    const dealt = dealPuzzle1Clues(['a', 'b'])
    expect(Object.values(dealt).every((c) => c.length >= 1)).toBe(true)
    expect(Object.values(dealt).flat().every((c) => c.includes('scanned'))).toBe(true)
  })
})
