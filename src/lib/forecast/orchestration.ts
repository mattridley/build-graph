import 'server-only'

import {
  forecastResultSchema,
  type ForecastResult,
} from '@/lib/contracts/forecast'
import { londonDate, londonTargetInstant } from '@/lib/forecast/calendar'
import { percentile } from '@/lib/forecast/engine'
import {
  applyForecastScenario,
  ForecastGraphError,
  ForecastScenarioError,
} from '@/lib/forecast/graph'
import { resolveCycleDistribution } from '@/lib/forecast/distributions'
import type {
  ForecastDistributions,
  ForecastEngineInput,
  ForecastScenario,
} from '@/lib/forecast/types'
import {
  forecastEngineInputSchema,
  forecastProgressSchema,
  simulationShardSummarySchema,
  type ForecastProgress,
  type SimulationShardPayload,
  type SimulationShardSummary,
} from '@/lib/forecast/workflow-contracts'

export type ForecastFailureCode =
  | 'invalid_graph'
  | 'postgres_unavailable'
  | 'clickhouse_unavailable'
  | 'child_failure'
  | 'aggregation_failure'
  | 'timeout'

export class ForecastWorkflowError extends Error {
  constructor(
    public readonly code: ForecastFailureCode,
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ForecastWorkflowError'
  }
}

export interface WorkflowInvestigation {
  id: string
  projectId: string
  targetDate: string
  randomSeed: number
  selectedScenarioIds: string[]
  parsedIntent: { kind: string }
}

export interface WorkflowGraph {
  project: {
    id: string
    name: string
    timezone: string
    targetDate: string
    forecastAnchorAt: Date
    workingDayStart: string
    workingDayEnd: string
    enabledWeekdays: number[]
  }
  scopeGroups: Array<{
    id: string
    slug: string
    name: string
    classification: 'core' | 'optional'
  }>
  workItems: Array<{
    id: string
    scopeGroupId: string | null
    kind: 'requirement' | 'task' | 'pull_request' | 'test' | 'milestone'
    status: 'todo' | 'in_progress' | 'blocked' | 'done'
    title: string
    size: 'xs' | 's' | 'm' | 'l' | 'xl'
    progressPercent: number
    graphX: number | null
    graphY: number | null
  }>
  dependencies: Array<{ predecessorId: string; successorId: string }>
}

export interface StoredForecastSample {
  project_id: string
  investigation_id: string
  scenario_id: string
  sample_number: number
  completion_at: string
  sampled_critical_path: string[]
}

export interface StoredForecastImpact {
  item_id: string
  criticality_frequency: number
  expected_delay_hours: number
  sample_count: number
}

export interface ForecastWorkflowDependencies {
  loadInvestigation(id: string): Promise<WorkflowInvestigation>
  markRunning(id: string, runId: string): Promise<void>
  loadGraph(projectId: string): Promise<WorkflowGraph>
  loadScenarios(projectId: string): Promise<ForecastScenario[]>
  loadDistributions(
    projectId: string,
    graph: WorkflowGraph,
  ): Promise<ForecastDistributions>
  triggerShardBatch(
    payloads: SimulationShardPayload[],
  ): Promise<
    Array<
      | { ok: true; output: SimulationShardSummary }
      | { ok: false; error: unknown }
    >
  >
  readSamples(
    investigationId: string,
    scenarioId: string,
  ): Promise<StoredForecastSample[]>
  readImpacts(
    investigationId: string,
    scenarioId: string,
  ): Promise<StoredForecastImpact[]>
  persistCompletion(
    investigation: WorkflowInvestigation,
    result: ForecastResult,
    summaries: Array<{
      scenarioId: string
      probability: number
      p50: string
      p80: string
      p95: string
      sampleCount: number
    }>,
  ): Promise<void>
  markFailed(
    investigationId: string,
    code: ForecastFailureCode,
    detail: string,
  ): Promise<void>
  reportProgress(progress: ForecastProgress): void
  tagRun(tags: string[]): Promise<void>
}

function normalizeFailure(error: unknown, stage: ForecastProgress['stage']) {
  if (error instanceof ForecastWorkflowError) return error
  if (
    error instanceof ForecastGraphError ||
    error instanceof ForecastScenarioError
  ) {
    return new ForecastWorkflowError(
      'invalid_graph',
      'The project graph or selected scenario is invalid.',
      false,
      { cause: error },
    )
  }
  if (
    error instanceof Error &&
    (error.name.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('timed out'))
  ) {
    return new ForecastWorkflowError(
      'timeout',
      'The forecast exceeded its execution window.',
      true,
      { cause: error },
    )
  }
  return new ForecastWorkflowError(
    stage === 'loading'
      ? 'postgres_unavailable'
      : stage === 'aggregating'
        ? 'aggregation_failure'
        : 'clickhouse_unavailable',
    stage === 'loading'
      ? 'Operational project data is temporarily unavailable.'
      : 'Analytical forecast data is temporarily unavailable.',
    true,
    { cause: error },
  )
}

function buildInput(
  investigation: WorkflowInvestigation,
  graph: WorkflowGraph,
  scenarios: ForecastScenario[],
  distributions: ForecastDistributions,
) {
  const baseline = scenarios.find((scenario) => scenario.slug === 'baseline')
  if (!baseline) {
    throw new ForecastWorkflowError(
      'invalid_graph',
      'The baseline scenario is missing.',
      false,
    )
  }
  const comparisons = investigation.selectedScenarioIds.map((scenarioId) => {
    const scenario = scenarios.find((candidate) => candidate.id === scenarioId)
    if (!scenario) {
      throw new ForecastWorkflowError(
        'invalid_graph',
        `Selected scenario ${scenarioId} is unavailable.`,
        false,
      )
    }
    return scenario
  })
  const input = forecastEngineInputSchema.parse({
    investigationId: investigation.id,
    seed: investigation.randomSeed,
    sampleCount: 2_500,
    shardSize: 2_500,
    project: {
      id: graph.project.id,
      name: graph.project.name,
      timezone: graph.project.timezone,
      forecastAnchorAt: graph.project.forecastAnchorAt.toISOString(),
      targetDate: investigation.targetDate,
      workingDayStart: graph.project.workingDayStart,
      workingDayEnd: graph.project.workingDayEnd,
      enabledWeekdays: graph.project.enabledWeekdays,
    },
    scopeGroups: graph.scopeGroups,
    nodes: graph.workItems,
    edges: graph.dependencies.map((edge) => ({
      source: edge.predecessorId,
      target: edge.successorId,
    })),
    baselineScenario: baseline,
    scenarios: comparisons,
    distributions,
  }) as ForecastEngineInput
  return { input, scenarios: [baseline, ...comparisons] }
}

function aggregatePersistedScenario(
  input: ForecastEngineInput,
  scenario: ForecastScenario,
  samples: StoredForecastSample[],
) {
  const expectedSampleCount = input.sampleCount ?? 2_500
  if (
    samples.length !== expectedSampleCount ||
    new Set(samples.map((sample) => sample.sample_number)).size !==
      expectedSampleCount
  ) {
    throw new ForecastWorkflowError(
      'aggregation_failure',
      `Scenario ${scenario.name} does not contain ${expectedSampleCount.toLocaleString('en-GB')} unique samples.`,
      true,
    )
  }
  const completions = samples.map((sample) =>
    new Date(sample.completion_at).getTime(),
  )
  if (completions.some((value) => !Number.isFinite(value))) {
    throw new ForecastWorkflowError(
      'aggregation_failure',
      `Scenario ${scenario.name} contains invalid completion timestamps.`,
      true,
    )
  }
  const target = londonTargetInstant(input.project.targetDate).getTime()
  const pathCounts = new Map<string, { path: string[]; count: number }>()
  const histogram = new Map<string, number>()
  for (const sample of samples) {
    const key = sample.sampled_critical_path.join('\u0000')
    const path = pathCounts.get(key) ?? {
      path: sample.sampled_critical_path,
      count: 0,
    }
    path.count++
    pathCounts.set(key, path)
    const date = londonDate(sample.completion_at)
    histogram.set(date, (histogram.get(date) ?? 0) + 1)
  }
  const criticalPath = [...pathCounts.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.path.join('\u0000').localeCompare(right.path.join('\u0000')),
  )[0]!.path
  return {
    scenario,
    probability:
      completions.filter((completion) => completion <= target).length /
      completions.length,
    p50: londonDate(percentile(completions, 0.5)),
    p80: londonDate(percentile(completions, 0.8)),
    p95: londonDate(percentile(completions, 0.95)),
    criticalPath,
    histogram,
  }
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function renderResult(
  input: ForecastEngineInput,
  aggregates: ReturnType<typeof aggregatePersistedScenario>[],
  baselineImpacts: StoredForecastImpact[],
) {
  const sampleCount = input.sampleCount ?? 2_500
  const baseline = aggregates[0]!
  const graph = applyForecastScenario(
    input.nodes,
    input.edges,
    input.scopeGroups,
    baseline.scenario,
  )
  const impacts = new Map(
    baselineImpacts.map((impact) => [impact.item_id, impact]),
  )
  const nodeMetrics = input.nodes.map((node) => ({
    itemId: node.id,
    criticalityFrequency: round(
      impacts.get(node.id)?.criticality_frequency ?? 0,
    ),
    expectedDelayHours: round(impacts.get(node.id)?.expected_delay_hours ?? 0),
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
  const fallbackCounts = Map.groupBy(
    nodeMetrics,
    (metric) => metric.distributionFallback,
  )
  return forecastResultSchema.parse({
    investigationId: input.investigationId,
    seed: input.seed,
    sampleCount,
    verdict: {
      headline: `${input.project.name} has a ${Math.round(baseline.probability * 100)}% on-time probability by ${input.project.targetDate}.`,
      targetDate: input.project.targetDate,
      onTimeProbability: round(baseline.probability),
      deltaPercentagePoints: 0,
      modelDisclaimer:
        'Dependency-and-history scenario model; not a delivery commitment and excludes individual capacity.',
    },
    graph: {
      nodes: input.nodes,
      edges: input.edges,
      criticalPathIds: baseline.criticalPath,
      highlightedBlockerIds: blockerRankings
        .slice(0, 3)
        .map((ranking) => ranking.itemId),
      excludedNodeIds: graph.excludedNodeIds,
    },
    distribution: {
      buckets: [...baseline.histogram.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, count]) => ({ date, count })),
      p50: baseline.p50,
      p80: baseline.p80,
      p95: baseline.p95,
    },
    interventions: aggregates.slice(1).map((aggregate) => ({
      scenarioId: aggregate.scenario.id,
      label: aggregate.scenario.name,
      probability: round(aggregate.probability),
      deltaPercentagePoints: round(
        (aggregate.probability - baseline.probability) * 100,
        1,
      ),
      excludedScopeGroups: aggregate.scenario.excludedScopeGroupIds.map(
        (groupId) =>
          input.scopeGroups.find((group) => group.id === groupId)?.slug ??
          groupId,
      ),
    })),
    evidence: [
      {
        label: 'Durable simulation samples',
        value: String(sampleCount),
        source: 'simulation',
        detail: `Seed ${input.seed}; aggregated after all child shards were persisted.`,
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
              : `Historical lookup used ${fallback === 'kind' ? 'kind-only' : 'exact kind-and-size'} evidence.`,
        })),
    ],
    analytics: { nodeMetrics, blockerRankings },
  })
}

export async function executeForecastWorkflow(
  investigationId: string,
  runId: string,
  dependencies: ForecastWorkflowDependencies,
) {
  let stage: ForecastProgress['stage'] = 'loading'
  let investigation: WorkflowInvestigation | undefined
  const report = (
    progress: Omit<ForecastProgress, 'projectId' | 'investigationId' | 'seed'>,
  ) => {
    if (!investigation) return
    dependencies.reportProgress(
      forecastProgressSchema.parse({
        ...progress,
        projectId: investigation.projectId,
        investigationId: investigation.id,
        seed: investigation.randomSeed,
      }),
    )
  }
  try {
    investigation = await dependencies.loadInvestigation(investigationId)
    await dependencies.markRunning(investigation.id, runId)
    report({
      stage,
      percentage: 5,
      completedShards: 0,
      totalShards: 0,
      scenarioLabel: null,
    })
    const graph = await dependencies.loadGraph(investigation.projectId)
    const savedScenarios = await dependencies.loadScenarios(
      investigation.projectId,
    )
    const distributions = await dependencies.loadDistributions(
      investigation.projectId,
      graph,
    )
    stage = 'validating'
    const prepared = buildInput(
      investigation,
      graph,
      savedScenarios,
      distributions,
    )
    await dependencies.tagRun([
      `project:${investigation.projectId}`,
      `investigation:${investigation.id}`,
      `seed:${investigation.randomSeed}`,
      ...prepared.scenarios.map((scenario) => `scenario:${scenario.id}`),
    ])
    for (const scenario of prepared.scenarios) {
      applyForecastScenario(
        prepared.input.nodes,
        prepared.input.edges,
        prepared.input.scopeGroups,
        scenario,
      )
    }
    const sampleCount = prepared.input.sampleCount ?? 2_500
    const shardSize = prepared.input.shardSize ?? sampleCount
    const shardsPerScenario = Math.ceil(sampleCount / shardSize)
    const totalShards = prepared.scenarios.length * shardsPerScenario
    report({
      stage,
      percentage: 10,
      completedShards: 0,
      totalShards,
      scenarioLabel: null,
    })

    stage = 'simulating'
    let completedShards = 0
    report({
      stage,
      percentage: 10,
      completedShards,
      totalShards,
      scenarioLabel: null,
    })
    const payloads = prepared.scenarios.flatMap((scenario) =>
      Array.from({ length: shardsPerScenario }, (_, shardIndex) => ({
        input: prepared.input,
        scenario,
        shardIndex,
        firstSample: shardIndex * shardSize,
        sampleCount: Math.min(shardSize, sampleCount - shardIndex * shardSize),
        baseSeed: prepared.input.seed,
      })),
    )
    const batch = await dependencies.triggerShardBatch(payloads)
    if (batch.length !== payloads.length) {
      throw new ForecastWorkflowError(
        'child_failure',
        `Expected ${payloads.length} simulation shards but received ${batch.length}.`,
        true,
      )
    }
    const failed = batch.find((result) => !result.ok)
    if (failed) {
      throw new ForecastWorkflowError(
        'child_failure',
        'A simulation shard failed.',
        true,
        { cause: failed.error },
      )
    }
    for (const result of batch) {
      if (result.ok) simulationShardSummarySchema.parse(result.output)
    }
    completedShards = batch.length
    report({
      stage,
      percentage: 75,
      completedShards,
      totalShards,
      scenarioLabel: null,
    })

    stage = 'aggregating'
    report({
      stage,
      percentage: 80,
      completedShards,
      totalShards,
      scenarioLabel: null,
    })
    const aggregates: ReturnType<typeof aggregatePersistedScenario>[] = []
    let baselineImpacts: StoredForecastImpact[] = []
    for (const [index, scenario] of prepared.scenarios.entries()) {
      const samples = await dependencies.readSamples(
        investigation.id,
        scenario.id,
      )
      aggregates.push(
        aggregatePersistedScenario(prepared.input, scenario, samples),
      )
      if (index === 0) {
        baselineImpacts = await dependencies.readImpacts(
          investigation.id,
          scenario.id,
        )
      }
    }
    stage = 'rendering'
    report({
      stage,
      percentage: 92,
      completedShards,
      totalShards,
      scenarioLabel: null,
    })
    const result = renderResult(prepared.input, aggregates, baselineImpacts)
    const summaries = aggregates.map((aggregate) => ({
      scenarioId: aggregate.scenario.id,
      probability: round(aggregate.probability),
      p50: aggregate.p50,
      p80: aggregate.p80,
      p95: aggregate.p95,
      sampleCount,
    }))
    await dependencies.persistCompletion(investigation, result, summaries)
    stage = 'complete'
    report({
      stage,
      percentage: 100,
      completedShards,
      totalShards,
      scenarioLabel: null,
    })
    return { result, completedShards, totalShards }
  } catch (error) {
    const normalized = normalizeFailure(error, stage)
    if (investigation) {
      try {
        await dependencies.markFailed(
          investigation.id,
          normalized.code,
          normalized.message,
        )
      } catch {
        // Preserve the normalized forecast failure if Postgres is also
        // unavailable while recording the terminal state.
      }
      report({
        stage: 'failed',
        percentage: 100,
        completedShards: 0,
        totalShards: 0,
        scenarioLabel: null,
      })
    }
    throw normalized
  }
}
