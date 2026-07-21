import { describe, expect, it } from 'vitest'

import { forecastRelease } from '@/lib/forecast/engine'
import {
  executeForecastWorkflow,
  type ForecastWorkflowDependencies,
  type StoredForecastImpact,
  type StoredForecastSample,
} from '@/lib/forecast/orchestration'
import { runSimulationShard } from '@/lib/forecast/simulation-workflow'
import {
  workflowDistributions,
  workflowEngineInput,
  workflowIds,
  workflowScenario,
} from '@/lib/forecast/workflow-test-fixture'

function harness() {
  const input = workflowEngineInput()
  const samples: StoredForecastSample[] = []
  const impactRows: Array<StoredForecastImpact & { scenario_id: string }> = []
  const progress: Array<{ stage: string; completedShards: number }> = []
  const failures: Array<{ code: string; detail: string }> = []
  let persisted:
    Parameters<ForecastWorkflowDependencies['persistCompletion']>[1] | undefined
  const dependencies: ForecastWorkflowDependencies = {
    loadInvestigation: async () => ({
      id: workflowIds.investigation,
      projectId: workflowIds.project,
      targetDate: input.project.targetDate,
      randomSeed: input.seed,
      selectedScenarioIds: [],
      parsedIntent: { kind: 'deadline_probability' },
    }),
    markRunning: async () => undefined,
    loadGraph: async () => ({
      project: {
        id: input.project.id,
        name: input.project.name,
        timezone: input.project.timezone,
        targetDate: input.project.targetDate,
        forecastAnchorAt: new Date(input.project.forecastAnchorAt),
        workingDayStart: input.project.workingDayStart,
        workingDayEnd: input.project.workingDayEnd,
        enabledWeekdays: input.project.enabledWeekdays,
      },
      scopeGroups: input.scopeGroups,
      workItems: input.nodes.map((node) => ({
        ...node,
        graphX: node.graphX ?? null,
        graphY: node.graphY ?? null,
      })),
      dependencies: input.edges.map((edge) => ({
        predecessorId: edge.source,
        successorId: edge.target,
      })),
    }),
    loadScenarios: async () => [workflowScenario],
    loadDistributions: async () => workflowDistributions,
    triggerShardBatch: async (payloads) => {
      const results: Awaited<
        ReturnType<ForecastWorkflowDependencies['triggerShardBatch']>
      > = []
      for (const payload of payloads) {
        const output = await runSimulationShard(payload, {
          findExistingSampleNumbers: async (
            investigationId,
            scenarioId,
            firstSample,
            lastSample,
          ) =>
            new Set(
              samples
                .filter(
                  (sample) =>
                    sample.investigation_id === investigationId &&
                    sample.scenario_id === scenarioId &&
                    sample.sample_number >= firstSample &&
                    sample.sample_number <= lastSample,
                )
                .map((sample) => sample.sample_number),
            ),
          insertImpacts: async (rows) => {
            impactRows.push(
              ...rows.map((row) => ({
                scenario_id: row.scenario_id,
                item_id: row.item_id,
                criticality_frequency: row.criticality_frequency,
                expected_delay_hours: row.expected_delay_hours,
                sample_count: row.sample_count,
              })),
            )
          },
          insertSamples: async (rows) => {
            samples.push(...rows)
          },
        })
        results.push({ ok: true, output })
      }
      return results
    },
    readSamples: async (investigationId, scenarioId) =>
      samples.filter(
        (sample) =>
          sample.investigation_id === investigationId &&
          sample.scenario_id === scenarioId,
      ),
    readImpacts: async (_investigationId, scenarioId) => {
      const grouped = Map.groupBy(
        impactRows.filter((row) => row.scenario_id === scenarioId),
        (row) => row.item_id,
      )
      return [...grouped.entries()].map(([itemId, rows]) => {
        const count = rows.reduce((total, row) => total + row.sample_count, 0)
        return {
          item_id: itemId,
          criticality_frequency:
            rows.reduce(
              (total, row) =>
                total + row.criticality_frequency * row.sample_count,
              0,
            ) / count,
          expected_delay_hours:
            rows.reduce(
              (total, row) =>
                total + row.expected_delay_hours * row.sample_count,
              0,
            ) / count,
          sample_count: count,
        }
      })
    },
    persistCompletion: async (_investigation, result) => {
      persisted = result
    },
    markFailed: async (_id, code, detail) => {
      failures.push({ code, detail })
    },
    reportProgress: (value) => {
      progress.push({
        stage: value.stage,
        completedShards: value.completedShards,
      })
    },
    tagRun: async () => undefined,
  }
  return {
    dependencies,
    samples,
    impactRows,
    progress,
    failures,
    persisted: () => persisted,
  }
}

describe('forecast parent workflow', () => {
  it('fans out ten shards, aggregates durable output, and is parent-idempotent', async () => {
    const test = harness()
    const first = await executeForecastWorkflow(
      workflowIds.investigation,
      'run-1',
      test.dependencies,
    )
    const second = await executeForecastWorkflow(
      workflowIds.investigation,
      'run-1',
      test.dependencies,
    )
    expect(first.totalShards).toBe(10)
    expect(first.completedShards).toBe(10)
    expect(second.completedShards).toBe(10)
    expect(test.samples).toHaveLength(2_500)
    expect(test.impactRows.length).toBeGreaterThan(0)
    expect(test.persisted()).toBeDefined()
    expect(test.progress.some((value) => value.stage === 'simulating')).toBe(
      true,
    )
    expect(test.progress.at(-1)).toEqual({
      stage: 'complete',
      completedShards: 10,
    })
    const singleProcess = forecastRelease(workflowEngineInput())
    expect(first.result.verdict.onTimeProbability).toBe(
      singleProcess.verdict.onTimeProbability,
    )
    expect(first.result.distribution).toEqual(singleProcess.distribution)
    expect(first.result.graph.criticalPathIds).toEqual(
      singleProcess.graph.criticalPathIds,
    )
  }, 15_000)

  it('normalizes child failures and timeouts into retryable failed states', async () => {
    const child = harness()
    child.dependencies.triggerShardBatch = async () => [
      { ok: false, error: new Error('child failed') },
    ]
    await expect(
      executeForecastWorkflow(
        workflowIds.investigation,
        'run-child-failure',
        child.dependencies,
      ),
    ).rejects.toMatchObject({
      code: 'child_failure',
      retryable: true,
    })
    expect(child.failures.at(-1)?.code).toBe('child_failure')

    const timeout = harness()
    timeout.dependencies.triggerShardBatch = async () => {
      const error = new Error('wait timed out')
      error.name = 'TimeoutError'
      throw error
    }
    await expect(
      executeForecastWorkflow(
        workflowIds.investigation,
        'run-timeout',
        timeout.dependencies,
      ),
    ).rejects.toMatchObject({
      code: 'timeout',
      retryable: true,
    })
    expect(timeout.failures.at(-1)?.code).toBe('timeout')
  })
})
