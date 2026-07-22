import { beforeEach, describe, expect, it } from 'vitest'

import { consumeRateLimit, resetRateLimitsForTests } from '@/lib/rate-limit'

describe('consumeRateLimit', () => {
  beforeEach(resetRateLimitsForTests)

  it('rejects work after the per-window budget and reports a retry delay', () => {
    expect(consumeRateLimit('client', { limit: 2, now: 1_000 }).allowed).toBe(
      true,
    )
    expect(consumeRateLimit('client', { limit: 2, now: 1_001 }).allowed).toBe(
      true,
    )
    expect(consumeRateLimit('client', { limit: 2, now: 1_002 })).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    })
  })

  it('starts a fresh budget after the window expires', () => {
    consumeRateLimit('client', { limit: 1, windowMs: 100, now: 1_000 })
    expect(
      consumeRateLimit('client', { limit: 1, windowMs: 100, now: 1_100 })
        .allowed,
    ).toBe(true)
  })
})
