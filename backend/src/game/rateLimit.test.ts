import { describe, expect, it } from 'vitest'
import { RateLimiter } from './rateLimit'

describe('RateLimiter', () => {
  it('allows a burst up to capacity, then reports the wait', () => {
    const rl = new RateLimiter({ capacity: 3, refillPerSec: 2 })
    expect([rl.take('a', 0), rl.take('a', 0), rl.take('a', 0)]).toEqual([0, 0, 0])
    expect(rl.take('a', 0)).toBe(500)
  })

  it('refills over time without exceeding capacity', () => {
    const rl = new RateLimiter({ capacity: 2, refillPerSec: 1 })
    rl.take('a', 0)
    rl.take('a', 0)
    expect(rl.take('a', 1000)).toBe(0)
    expect(rl.take('a', 1000)).toBeGreaterThan(0)
    // A long idle period refills only to capacity.
    expect([rl.take('a', 60_000), rl.take('a', 60_000)]).toEqual([0, 0])
    expect(rl.take('a', 60_000)).toBeGreaterThan(0)
  })

  it('keeps keys independent', () => {
    const rl = new RateLimiter({ capacity: 1, refillPerSec: 1 })
    expect(rl.take('a', 0)).toBe(0)
    expect(rl.take('a', 0)).toBeGreaterThan(0)
    expect(rl.take('b', 0)).toBe(0)
  })
})
