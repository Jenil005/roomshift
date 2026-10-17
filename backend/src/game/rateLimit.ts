/**
 * Token-bucket rate limiter keyed by an arbitrary string (IP, player token hash).
 *
 * In-memory only. Inside a GameRoom it is exact for that room (one instance serves all of
 * its commands). In the worker it is per isolate, so it is best-effort abuse protection,
 * not a quota. Limits are generous because players at a venue often share one IP.
 */

export interface BucketConfig {
  capacity: number // burst size
  refillPerSec: number // sustained rate
}

const MAX_KEYS = 5000

export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>()

  constructor(private readonly config: BucketConfig) {}

  /** Takes one token. Returns 0 when allowed, else the ms to wait before retrying. */
  take(key: string, now: number): number {
    const { capacity, refillPerSec } = this.config
    let bucket = this.buckets.get(key)
    if (!bucket) {
      if (this.buckets.size >= MAX_KEYS) this.buckets.clear() // bounded memory; worst case is a brief reset
      bucket = { tokens: capacity, at: now }
      this.buckets.set(key, bucket)
    }
    bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.at) / 1000) * refillPerSec)
    bucket.at = now
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return 0
    }
    return Math.ceil(((1 - bucket.tokens) / refillPerSec) * 1000)
  }
}
