import { performance } from 'node:perf_hooks'

import { describe, expect, it } from 'vitest'

import { buildAtlasFixture } from '@/lib/demo/atlas'
import { deterministicDemoUuid } from '@/lib/demo/uuid'
import {
  forecastRelease,
  MINIMUM_IN_PROGRESS_HOURS,
  percentile,
  sampleNodeDuration,
} from '@/lib/forecast/engine'
import type {
  ForecastDistributions,
  ForecastEngineInput,
  ForecastNode,
  TriangularDistribution,
  WorkItemKind,
  WorkItemSize,
} from '@/lib/forecast/types'

const fixed = (hours: number): TriangularDistribution => ({
  p25: hours,
  p50: hours,
  p90: hours,
  sampleCount: 100,
})

const durationRuleDistributions: ForecastDistributions = {
  cycle: [{ kind: 'task', size: 'm', ...fixed(10) }],
  blocked: [{ kind: 'task', ...fixed(4) }],
  globalCycle: fixed(10),
  globalBlocked: fixed(4),
  ci: {
    failureProbability: 1,
    durationP50Seconds: 3_600,
    durationP90Seconds: 3_600,
  },
}

const node = (
  status: ForecastNode['status'],
  overrides: Partial<ForecastNode> = {},
): ForecastNode => ({
  id: `${status}-${overrides.kind ?? 'task'}`,
  scopeGroupId: 'core',
  kind: 'task',
  status,
  title: 'Work',
  size: 'm',
  progressPercent: 0,
  ...overrides,
})

function atlasInput(sampleCount = 2_500, shardSize = 250): ForecastEngineInput {
  const atlas = buildAtlasFixture()
  const sizeDistributions: Record<WorkItemSize, TriangularDistribution> = {
    xs: { p25: 1, p50: 3, p90: 9, sampleCount: 5_000 },
    s: { p25: 3, p50: 7, p90: 22, sampleCount: 5_000 },
    m: { p25: 5, p50: 12, p90: 34, sampleCount: 5_000 },
    l: { p25: 8, p50: 20, p90: 50, sampleCount: 5_000 },
    xl: { p25: 30, p50: 55, p90: 90, sampleCount: 5_000 },
  }
  const kinds: WorkItemKind[] = ['requirement', 'task', 'pull_request', 'test']
  const sizes: WorkItemSize[] = ['xs', 's', 'm', 'l', 'xl']
  const cycle = kinds.flatMap((kind) =>
    sizes.map((size) => ({ kind, size, ...sizeDistributions[size] })),
  )
  return {
    investigationId: deterministicDemoUuid('forecast:test'),
    seed: 84_217,
    sampleCount,
    shardSize,
    project: {
      id: atlas.project.id,
      name: atlas.project.name,
      timezone: 'Europe/London',
      forecastAnchorAt: atlas.project.forecastAnchorAt,
      targetDate: atlas.project.targetDate,
      workingDayStart: '09:00:00',
      workingDayEnd: '17:00:00',
      enabledWeekdays: [1, 2, 3, 4, 5],
    },
    scopeGroups: atlas.scopeGroups,
    nodes: atlas.workItems.map((item) => ({
      id: item.id,
      scopeGroupId: item.scopeGroupId,
      kind: item.kind,
      status: item.status,
      title: item.title,
      size: item.size,
      progressPercent: item.progressPercent,
      graphX: item.graphX,
      graphY: item.graphY,
    })),
    edges: atlas.dependencies.map((edge) => ({
      source: edge.predecessorId,
      target: edge.successorId,
    })),
    baselineScenario: atlas.scenarios.find(
      (scenario) => scenario.slug === 'baseline',
    )!,
    scenarios: [
      atlas.scenarios.find(
        (scenario) => scenario.slug === 'defer-audit-export',
      )!,
    ],
    distributions: {
      cycle,
      blocked: kinds.map((kind) => ({
        kind,
        p25: 13,
        p50: 22,
        p90: 34,
        sampleCount: 5_000,
      })),
      globalCycle: sizeDistributions.m,
      globalBlocked: { p25: 13, p50: 22, p90: 34, sampleCount: 5_000 },
      ci: {
        failureProbability: 0.18,
        durationP50Seconds: 420,
        durationP90Seconds: 900,
      },
    },
  }
}

describe('forecast duration and aggregation rules', () => {
  it('applies every status, blocker, minimum-remaining, and CI retry rule', () => {
    const input = { seed: 1, distributions: durationRuleDistributions }
    expect(sampleNodeDuration(node('done'), input, 0).durationHours).toBe(0)
    expect(sampleNodeDuration(node('todo'), input, 0).durationHours).toBe(10)
    expect(
      sampleNodeDuration(node('in_progress', { progressPercent: 60 }), input, 0)
        .durationHours,
    ).toBe(4)
    expect(
      sampleNodeDuration(node('in_progress', { progressPercent: 99 }), input, 0)
        .durationHours,
    ).toBe(MINIMUM_IN_PROGRESS_HOURS)
    expect(
      sampleNodeDuration(node('blocked', { progressPercent: 50 }), input, 0)
        .durationHours,
    ).toBe(9)
    expect(
      sampleNodeDuration(
        node('blocked', { progressPercent: 50 }),
        input,
        0,
        true,
      ).durationHours,
    ).toBe(5)
    const testGate = sampleNodeDuration(
      node('todo', { kind: 'test' }),
      input,
      0,
    )
    expect(testGate.durationHours).toBeGreaterThan(10)
    expect(testGate.durationHours).toBeLessThanOrEqual(11)
  })

  it('uses exact, kind-only, then global distribution fallback', () => {
    const distributions: ForecastDistributions = {
      ...durationRuleDistributions,
      cycle: [
        { kind: 'task', size: 'm', ...fixed(10) },
        { kind: 'test', ...fixed(8) },
      ],
    }
    expect(
      sampleNodeDuration(node('todo'), { seed: 1, distributions }, 0).fallback,
    ).toBe('kind_size')
    expect(
      sampleNodeDuration(
        node('todo', { kind: 'test', size: 'l' }),
        { seed: 1, distributions },
        0,
      ).fallback,
    ).toBe('kind')
    expect(
      sampleNodeDuration(
        node('todo', { kind: 'requirement', size: 'xl' }),
        { seed: 1, distributions },
        0,
      ).fallback,
    ).toBe('global')
  })

  it('defines stable interpolated percentiles', () => {
    expect(percentile([40, 10, 20, 30], 0.5)).toBe(25)
    expect(percentile([10, 20, 30, 40], 0.8)).toBeCloseTo(34)
  })
})

describe('Atlas deterministic forecast', () => {
  it('schedules the longest predecessor branch as the critical path', () => {
    const input = atlasInput(1, 1)
    const core = input.scopeGroups.find(
      (group) => group.classification === 'core',
    )!
    const releaseId = deterministicDemoUuid('mini:release')
    const fastId = deterministicDemoUuid('mini:fast')
    const slowId = deterministicDemoUuid('mini:slow')
    input.nodes = [
      {
        id: fastId,
        scopeGroupId: core.id,
        kind: 'task',
        status: 'todo',
        title: 'Fast',
        size: 'xs',
        progressPercent: 0,
      },
      {
        id: slowId,
        scopeGroupId: core.id,
        kind: 'task',
        status: 'todo',
        title: 'Slow',
        size: 'l',
        progressPercent: 0,
      },
      {
        id: releaseId,
        scopeGroupId: core.id,
        kind: 'milestone',
        status: 'todo',
        title: 'Release',
        size: 'xs',
        progressPercent: 0,
      },
    ]
    input.edges = [
      { source: fastId, target: releaseId },
      { source: slowId, target: releaseId },
    ]
    input.scenarios = []
    input.distributions.cycle = [
      { kind: 'task', size: 'xs', ...fixed(2) },
      { kind: 'task', size: 'l', ...fixed(10) },
    ]
    expect(forecastRelease(input).graph.criticalPathIds).toEqual([
      slowId,
      releaseId,
    ])
  })

  it('identifies sparse-history fallback in result evidence', () => {
    const input = atlasInput(10, 4)
    input.scenarios = []
    input.distributions.cycle = []
    const result = forecastRelease(input)
    expect(
      result.evidence.some(
        (item) =>
          item.source === 'clickhouse' &&
          item.detail.includes('global seeded prior'),
      ),
    ).toBe(true)
    expect(
      result.analytics.nodeMetrics.every(
        (metric) => metric.distributionFallback === 'global',
      ),
    ).toBe(true)
  })

  it('is reproducible across shard boundaries and exposes finite ordered analytics', () => {
    const first = forecastRelease(atlasInput(250, 17))
    const second = forecastRelease(atlasInput(250, 100))
    expect(first).toEqual(second)
    expect(first.seed).toBe(84_217)
    expect(first.distribution.p50 <= first.distribution.p80).toBe(true)
    expect(first.distribution.p80 <= first.distribution.p95).toBe(true)
    expect(first.verdict.onTimeProbability).toBeGreaterThanOrEqual(0)
    expect(first.verdict.onTimeProbability).toBeLessThanOrEqual(1)
    expect(
      first.analytics.nodeMetrics.every((metric) =>
        Number.isFinite(metric.expectedDelayHours),
      ),
    ).toBe(true)
    expect(first.verdict.headline.trim().split(/\s+/).length).toBeLessThan(40)
  })

  it('meets the frozen 2,500-sample calibration contract within a warm-run budget', () => {
    const started = performance.now()
    const result = forecastRelease(atlasInput())
    const duration = performance.now() - started
    const deferred = result.interventions.find(
      (scenario) => scenario.label === 'Defer audit export',
    )!
    expect(result.verdict.onTimeProbability).toBeGreaterThanOrEqual(0.35)
    expect(result.verdict.onTimeProbability).toBeLessThanOrEqual(0.5)
    expect(deferred.probability).toBeGreaterThanOrEqual(0.78)
    expect(deferred.probability).toBeLessThanOrEqual(0.85)
    expect(result.graph.excludedNodeIds).toEqual([])
    expect(duration).toBeLessThan(15_000)
  }, 20_000)
})
