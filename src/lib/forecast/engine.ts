import {
  forecastResultSchema,
  type ForecastResult,
} from '@/lib/contracts/forecast'
import {
  addLondonBusinessHours,
  londonDate,
  londonTargetInstant,
  normalizeToBusinessTime,
} from '@/lib/forecast/calendar'
import {
  resolveBlockedDistribution,
  resolveCycleDistribution,
  sampleTriangular,
} from '@/lib/forecast/distributions'
import { applyForecastScenario } from '@/lib/forecast/graph'
import { createSeededRandom } from '@/lib/forecast/prng'
import type {
  DistributionFallback,
  ForecastEngineInput,
  ForecastNode,
  ForecastSample,
  ForecastScenario,
} from '@/lib/forecast/types'

// Active work retains at least 30 minutes so a 99-100% progress signal cannot
// collapse an unfinished item to zero remaining dependency time.
export const MINIMUM_IN_PROGRESS_HOURS = 0.5
export const PRODUCTION_SAMPLE_COUNT = 2_500

export interface SampledNodeDuration {
  durationHours: number
  fallback: DistributionFallback
  blockedPenaltyHours: number
  retryDelayHours: number
}

export function sampleNodeDuration(
  node: ForecastNode,
  input: Pick<ForecastEngineInput, 'seed' | 'distributions'>,
  sampleIndex: number,
  blockerResolved = false,
): SampledNodeDuration {
  if (
    !Number.isFinite(node.progressPercent) ||
    node.progressPercent < 0 ||
    node.progressPercent > 100
  ) {
    throw new RangeError(
      `Node ${node.id} progress must be between zero and 100`,
    )
  }
  const resolved = resolveCycleDistribution(node, input.distributions)
  if (node.kind === 'milestone' || node.status === 'done') {
    return {
      durationHours: 0,
      fallback: resolved.fallback,
      blockedPenaltyHours: 0,
      retryDelayHours: 0,
    }
  }
  const base = sampleTriangular(
    resolved.distribution,
    createSeededRandom(input.seed, sampleIndex, node.id, 'cycle'),
  )
  const progressRemaining = Math.max(0, 1 - node.progressPercent / 100)
  let remaining =
    node.status === 'todo'
      ? base
      : Math.max(base * progressRemaining, MINIMUM_IN_PROGRESS_HOURS)
  let blockedPenaltyHours = 0
  if (node.status === 'blocked' && !blockerResolved) {
    blockedPenaltyHours = sampleTriangular(
      resolveBlockedDistribution(node, input.distributions),
      createSeededRandom(input.seed, sampleIndex, node.id, 'blocked'),
    )
    remaining += blockedPenaltyHours
  }
  let retryDelayHours = 0
  const isCiGate = node.kind === 'test' || /\bci\b/i.test(node.title)
  if (isCiGate) {
    const ci = input.distributions.ci
    if (
      !Number.isFinite(ci.failureProbability) ||
      ci.failureProbability < 0 ||
      ci.failureProbability > 1
    ) {
      throw new RangeError(
        'CI failure probability must be between zero and one',
      )
    }
    const failureRandom = createSeededRandom(
      input.seed,
      sampleIndex,
      node.id,
      'ci-failure',
    )
    if (failureRandom() < ci.failureProbability) {
      retryDelayHours =
        sampleTriangular(
          {
            p25: ci.durationP50Seconds * 0.5,
            p50: ci.durationP50Seconds,
            p90: ci.durationP90Seconds,
            sampleCount: 1,
          },
          createSeededRandom(input.seed, sampleIndex, node.id, 'ci-duration'),
        ) / 3_600
      remaining += retryDelayHours
    }
  }
  return {
    durationHours: remaining,
    fallback: resolved.fallback,
    blockedPenaltyHours,
    retryDelayHours,
  }
}

function simulateCompiledSample(
  input: ForecastEngineInput,
  graph: ReturnType<typeof applyForecastScenario>,
  sampleIndex: number,
) {
  const predecessorIds = new Map(
    graph.nodes.map((node) => [node.id, [] as string[]]),
  )
  for (const edge of graph.edges)
    predecessorIds.get(edge.target)!.push(edge.source)
  const finishTimes = new Map<string, number>()
  const criticalPaths = new Map<string, string[]>()
  const pathDelays = new Map<
    string,
    Array<{ itemId: string; durationHours: number }>
  >()
  const anchor = normalizeToBusinessTime(
    input.project.forecastAnchorAt,
  ).getTime()

  for (const node of graph.ordered) {
    const predecessors = predecessorIds.get(node.id)!
    let controllingPredecessor: string | undefined
    let startAt = anchor
    for (const predecessorId of predecessors) {
      const candidate = finishTimes.get(predecessorId)!
      if (candidate > startAt) {
        startAt = candidate
        controllingPredecessor = predecessorId
      }
    }
    const sampled = sampleNodeDuration(
      node,
      input,
      sampleIndex,
      graph.resolvedBlockerIds.has(node.id),
    )
    const finishAt =
      sampled.durationHours === 0
        ? startAt
        : addLondonBusinessHours(startAt, sampled.durationHours).getTime()
    finishTimes.set(node.id, finishAt)
    const previousPath = controllingPredecessor
      ? criticalPaths.get(controllingPredecessor)!
      : []
    const previousDelays = controllingPredecessor
      ? pathDelays.get(controllingPredecessor)!
      : []
    criticalPaths.set(node.id, [...previousPath, node.id])
    pathDelays.set(node.id, [
      ...previousDelays,
      { itemId: node.id, durationHours: sampled.durationHours },
    ])
  }

  return {
    sampleIndex,
    completionAt: finishTimes.get(graph.milestoneId)!,
    criticalPathIds: criticalPaths.get(graph.milestoneId)!,
    nodeDelays: pathDelays.get(graph.milestoneId)!,
  } satisfies ForecastSample
}

export function simulateScenarioSamples(
  input: ForecastEngineInput,
  scenario: ForecastScenario,
  startSample: number,
  count: number,
) {
  if (!Number.isInteger(startSample) || startSample < 0)
    throw new RangeError('startSample must be non-negative')
  if (!Number.isInteger(count) || count < 1)
    throw new RangeError('count must be positive')
  const graph = applyForecastScenario(
    input.nodes,
    input.edges,
    input.scopeGroups,
    scenario,
  )
  return Array.from({ length: count }, (_, offset) =>
    simulateCompiledSample(input, graph, startSample + offset),
  )
}

export function percentile(values: number[], probability: number) {
  if (values.length === 0)
    throw new RangeError('Cannot calculate a percentile from no values')
  if (probability < 0 || probability > 1)
    throw new RangeError('Percentile probability must be bounded')
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]!
  const fraction = position - lower
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * fraction
}

function scenarioSamples(
  input: ForecastEngineInput,
  scenario: ForecastScenario,
) {
  const sampleCount = input.sampleCount ?? PRODUCTION_SAMPLE_COUNT
  const shardSize = input.shardSize ?? 250
  if (!Number.isInteger(sampleCount) || sampleCount < 1)
    throw new RangeError('sampleCount must be positive')
  if (!Number.isInteger(shardSize) || shardSize < 1)
    throw new RangeError('shardSize must be positive')
  const samples: ForecastSample[] = []
  const graph = applyForecastScenario(
    input.nodes,
    input.edges,
    input.scopeGroups,
    scenario,
  )
  for (let start = 0; start < sampleCount; start += shardSize) {
    const count = Math.min(shardSize, sampleCount - start)
    for (let offset = 0; offset < count; offset++) {
      samples.push(simulateCompiledSample(input, graph, start + offset))
    }
  }
  return samples.sort((left, right) => left.sampleIndex - right.sampleIndex)
}

function aggregateScenario(
  input: ForecastEngineInput,
  scenario: ForecastScenario,
) {
  const samples = scenarioSamples(input, scenario)
  const target = londonTargetInstant(input.project.targetDate).getTime()
  const probability =
    samples.filter((sample) => sample.completionAt <= target).length /
    samples.length
  const completions = samples.map((sample) => sample.completionAt)
  const pathCounts = new Map<string, { path: string[]; count: number }>()
  const criticalCounts = new Map<string, number>()
  const delayTotals = new Map<string, number>()
  for (const sample of samples) {
    const key = sample.criticalPathIds.join('\u0000')
    const path = pathCounts.get(key) ?? {
      path: sample.criticalPathIds,
      count: 0,
    }
    path.count++
    pathCounts.set(key, path)
    for (const nodeId of sample.criticalPathIds) {
      criticalCounts.set(nodeId, (criticalCounts.get(nodeId) ?? 0) + 1)
    }
    for (const delay of sample.nodeDelays) {
      delayTotals.set(
        delay.itemId,
        (delayTotals.get(delay.itemId) ?? 0) + delay.durationHours,
      )
    }
  }
  const representativePath = [...pathCounts.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.path.join('\u0000').localeCompare(right.path.join('\u0000')),
  )[0]!.path
  return {
    scenario,
    samples,
    probability,
    p50: percentile(completions, 0.5),
    p80: percentile(completions, 0.8),
    p95: percentile(completions, 0.95),
    representativePath,
    criticalCounts,
    delayTotals,
  }
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function validateProjectCalendar(input: ForecastEngineInput) {
  if (
    input.project.timezone !== 'Europe/London' ||
    input.project.workingDayStart !== '09:00:00' ||
    input.project.workingDayEnd !== '17:00:00' ||
    input.project.enabledWeekdays.join(',') !== '1,2,3,4,5'
  ) {
    throw new RangeError(
      'Forecast engine supports Europe/London, Monday-Friday, 09:00-17:00',
    )
  }
}

export function forecastRelease(input: ForecastEngineInput): ForecastResult {
  validateProjectCalendar(input)
  const baseline = aggregateScenario(input, input.baselineScenario)
  const sampleCount = baseline.samples.length
  const graph = applyForecastScenario(
    input.nodes,
    input.edges,
    input.scopeGroups,
    input.baselineScenario,
  )
  const nodeMetrics = input.nodes.map((node) => ({
    itemId: node.id,
    criticalityFrequency: round(
      (baseline.criticalCounts.get(node.id) ?? 0) / sampleCount,
    ),
    expectedDelayHours: round(
      (baseline.delayTotals.get(node.id) ?? 0) / sampleCount,
    ),
    distributionFallback: resolveCycleDistribution(node, input.distributions)
      .fallback,
  }))
  const blockerRankings = nodeMetrics
    .filter(
      (metric) =>
        input.nodes.find((node) => node.id === metric.itemId)?.status ===
        'blocked',
    )
    .sort(
      (left, right) =>
        right.expectedDelayHours - left.expectedDelayHours ||
        left.itemId.localeCompare(right.itemId),
    )
    .map((metric, index) => ({
      itemId: metric.itemId,
      rank: index + 1,
      expectedDelayHours: metric.expectedDelayHours,
    }))
  const histogram = new Map<string, number>()
  for (const sample of baseline.samples) {
    const date = londonDate(sample.completionAt)
    histogram.set(date, (histogram.get(date) ?? 0) + 1)
  }
  const scenarioResults = (input.scenarios ?? [])
    .filter((scenario) => scenario.id !== input.baselineScenario.id)
    .map((scenario) => aggregateScenario(input, scenario))
  const probabilityPercent = Math.round(baseline.probability * 100)
  const headline = `${input.project.name} has a ${probabilityPercent}% on-time probability by ${input.project.targetDate}.`
  if (headline.trim().split(/\s+/).length >= 40)
    throw new RangeError('Verdict headline must remain under 40 words')
  const fallbackCounts = Map.groupBy(
    nodeMetrics,
    (metric) => metric.distributionFallback,
  )
  const result = {
    investigationId: input.investigationId,
    seed: input.seed,
    sampleCount,
    verdict: {
      headline,
      targetDate: input.project.targetDate,
      onTimeProbability: round(baseline.probability),
      deltaPercentagePoints: 0,
      modelDisclaimer:
        'Dependency-and-history scenario model; not a delivery commitment and excludes individual capacity.',
    },
    graph: {
      nodes: input.nodes,
      edges: input.edges,
      criticalPathIds: baseline.representativePath,
      highlightedBlockerIds: blockerRankings
        .slice(0, 3)
        .map((ranking) => ranking.itemId),
      excludedNodeIds: graph.excludedNodeIds,
    },
    distribution: {
      buckets: [...histogram.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, count]) => ({ date, count })),
      p50: londonDate(baseline.p50),
      p80: londonDate(baseline.p80),
      p95: londonDate(baseline.p95),
    },
    interventions: scenarioResults.map((scenario) => ({
      scenarioId: scenario.scenario.id,
      label: scenario.scenario.name,
      probability: round(scenario.probability),
      deltaPercentagePoints: round(
        (scenario.probability - baseline.probability) * 100,
        1,
      ),
      excludedScopeGroups: scenario.scenario.excludedScopeGroupIds.map(
        (groupId) =>
          input.scopeGroups.find((group) => group.id === groupId)?.slug ??
          groupId,
      ),
    })),
    evidence: [
      {
        label: 'Simulation samples',
        value: String(sampleCount),
        source: 'simulation' as const,
        detail: `Seed ${input.seed}; stable sample identities are invariant to shard boundaries.`,
      },
      ...(['kind_size', 'kind', 'global'] as const)
        .filter((fallback) => (fallbackCounts.get(fallback)?.length ?? 0) > 0)
        .map((fallback) => ({
          label: `Duration history: ${fallback.replace('_', '+')}`,
          value: String(fallbackCounts.get(fallback)!.length),
          source: 'clickhouse' as const,
          detail:
            fallback === 'global'
              ? 'Sparse history used the global seeded prior.'
              : `Historical duration lookup used ${fallback === 'kind' ? 'kind-only' : 'exact kind-and-size'} evidence.`,
        })),
      {
        label: 'Critical path',
        value: `${baseline.representativePath.length} items`,
        source: 'simulation' as const,
        detail:
          'Most frequently observed longest dependency path across deterministic samples.',
      },
    ],
    analytics: { nodeMetrics, blockerRankings },
  }
  return forecastResultSchema.parse(result)
}
