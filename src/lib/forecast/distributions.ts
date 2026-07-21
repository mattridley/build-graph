import type {
  DistributionFallback,
  ForecastDistributions,
  ForecastNode,
  TriangularDistribution,
} from '@/lib/forecast/types'
import type { RandomSource } from '@/lib/forecast/prng'

export class InvalidDistributionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDistributionError'
  }
}

export function validateDistribution(value: TriangularDistribution) {
  if (
    !Number.isFinite(value.p25) ||
    !Number.isFinite(value.p50) ||
    !Number.isFinite(value.p90) ||
    !Number.isInteger(value.sampleCount) ||
    value.sampleCount < 1 ||
    value.p25 < 0 ||
    value.p25 > value.p50 ||
    value.p50 > value.p90
  ) {
    throw new InvalidDistributionError(
      'Distribution must have samples and satisfy 0 <= p25 <= p50 <= p90',
    )
  }
  return value
}

export function sampleTriangular(
  distribution: TriangularDistribution,
  random: RandomSource,
) {
  const {
    p25: minimum,
    p50: mode,
    p90: maximum,
  } = validateDistribution(distribution)
  if (maximum === minimum) return minimum
  const split = (mode - minimum) / (maximum - minimum)
  const value = random()
  if (value <= split) {
    return minimum + Math.sqrt(value * (maximum - minimum) * (mode - minimum))
  }
  return (
    maximum - Math.sqrt((1 - value) * (maximum - minimum) * (maximum - mode))
  )
}

export function resolveCycleDistribution(
  node: ForecastNode,
  distributions: ForecastDistributions,
): { distribution: TriangularDistribution; fallback: DistributionFallback } {
  const exact = distributions.cycle.find(
    (candidate) => candidate.kind === node.kind && candidate.size === node.size,
  )
  if (exact)
    return { distribution: validateDistribution(exact), fallback: 'kind_size' }
  const kind = distributions.cycle.find(
    (candidate) => candidate.kind === node.kind && candidate.size === undefined,
  )
  if (kind)
    return { distribution: validateDistribution(kind), fallback: 'kind' }
  return {
    distribution: validateDistribution(distributions.globalCycle),
    fallback: 'global',
  }
}

export function resolveBlockedDistribution(
  node: ForecastNode,
  distributions: ForecastDistributions,
) {
  const kind = distributions.blocked.find(
    (candidate) => candidate.kind === node.kind,
  )
  return validateDistribution(kind ?? distributions.globalBlocked)
}
