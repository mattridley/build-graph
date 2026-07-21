import { describe, expect, it } from 'vitest'

import {
  InvalidDistributionError,
  sampleTriangular,
} from '@/lib/forecast/distributions'
import { createSeededRandom } from '@/lib/forecast/prng'

describe('deterministic triangular sampling', () => {
  const distribution = { p25: 2, p50: 5, p90: 11, sampleCount: 100 }

  it('is bounded and reproducible without Math.random', () => {
    const first = createSeededRandom(42, 'sample')
    const second = createSeededRandom(42, 'sample')
    const left = Array.from({ length: 1_000 }, () =>
      sampleTriangular(distribution, first),
    )
    const right = Array.from({ length: 1_000 }, () =>
      sampleTriangular(distribution, second),
    )
    expect(left).toEqual(right)
    expect(Math.min(...left)).toBeGreaterThanOrEqual(2)
    expect(Math.max(...left)).toBeLessThanOrEqual(11)
    expect(new Set(left).size).toBeGreaterThan(900)
  })

  it('uses exact endpoints and rejects impossible quantiles', () => {
    expect(sampleTriangular(distribution, () => 0)).toBe(2)
    expect(sampleTriangular(distribution, () => 1)).toBe(11)
    expect(() =>
      sampleTriangular({ p25: 5, p50: 4, p90: 10, sampleCount: 1 }, () => 0.5),
    ).toThrowError(InvalidDistributionError)
  })
})
