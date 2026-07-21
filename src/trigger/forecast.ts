import { logger, metadata, queue, tags, task } from '@trigger.dev/sdk'

import {
  insertForecastSummaries,
  insertInvestigationEvents,
  queryForecastItemImpacts,
  queryForecastSamples,
} from '@/lib/clickhouse/storage'
import { deterministicDemoUuid } from '@/lib/demo/uuid'
import {
  executeForecastWorkflow,
  ForecastWorkflowError,
  type ForecastWorkflowDependencies,
} from '@/lib/forecast/orchestration'
import { loadForecastDistributions } from '@/lib/forecast/runtime'
import { runSimulationShard } from '@/lib/forecast/simulation-workflow'
import {
  simulationShardPayloadSchema,
  simulationShardSummarySchema,
  type SimulationShardPayload,
} from '@/lib/forecast/workflow-contracts'
import {
  getInvestigation,
  loadProjectGraph,
  readScenarios,
  updateInvestigation,
} from '@/lib/postgres/repositories'

const simulationQueue = queue({
  name: 'forecast-simulation',
  concurrencyLimit: 10,
})

export const simulateScenarioTask = task({
  id: 'simulate-scenario',
  queue: simulationQueue,
  maxDuration: 60,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 10_000,
    randomize: true,
  },
  run: async (rawPayload: SimulationShardPayload, { ctx }) => {
    const payload = simulationShardPayloadSchema.parse(rawPayload)
    metadata
      .set('stage', 'simulating')
      .set('projectId', payload.input.project.id)
      .set('investigationId', payload.input.investigationId)
      .set('scenarioId', payload.scenario.id)
      .set('scenarioLabel', payload.scenario.name)
      .set('shardIndex', payload.shardIndex)
      .set('firstSample', payload.firstSample)
      .set('sampleCount', payload.sampleCount)
      .set('seed', payload.baseSeed)
    const summary = await runSimulationShard(payload)
    metadata
      .set('stage', 'complete')
      .set('inserted', summary.inserted)
      .set('checksum', summary.checksum)
    logger.info('Forecast simulation shard completed', {
      runId: ctx.run.id,
      projectId: payload.input.project.id,
      investigationId: payload.input.investigationId,
      scenarioId: payload.scenario.id,
      shardIndex: payload.shardIndex,
      sampleCount: payload.sampleCount,
      inserted: summary.inserted,
      checksum: summary.checksum,
    })
    return simulationShardSummarySchema.parse(summary)
  },
})

function taskDependencies(): ForecastWorkflowDependencies {
  return {
    loadInvestigation: getInvestigation,
    markRunning: async (id, runId) => {
      await updateInvestigation(id, {
        status: 'running',
        triggerRunId: runId,
        startedAt: new Date(),
        failureCode: null,
        failureDetail: null,
      })
    },
    loadGraph: loadProjectGraph,
    loadScenarios: async (projectId) => {
      const rows = await readScenarios(projectId)
      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        excludedScopeGroupIds: row.excludedScopeGroupIds,
        resolvedBlockerIds: row.resolvedBlockerIds,
      }))
    },
    loadDistributions: async (projectId, graph) => {
      try {
        return await loadForecastDistributions(projectId, graph)
      } catch (error) {
        throw new ForecastWorkflowError(
          'clickhouse_unavailable',
          'Historical forecast distributions are temporarily unavailable.',
          true,
          { cause: error },
        )
      }
    },
    triggerShardBatch: async (payloads) => {
      const result = await simulateScenarioTask.batchTriggerAndWait(
        payloads.map((payload) => ({
          payload,
          options: {
            idempotencyKey: [
              'forecast-shard',
              payload.input.investigationId,
              payload.scenario.id,
              String(payload.shardIndex),
            ],
            idempotencyKeyTTL: '7d',
            tags: [
              `project:${payload.input.project.id}`,
              `investigation:${payload.input.investigationId}`,
              `scenario:${payload.scenario.id}`,
              `seed:${payload.baseSeed}`,
            ],
          },
        })),
      )
      return result.runs.map((run) =>
        run.ok
          ? { ok: true as const, output: run.output }
          : { ok: false as const, error: run.error },
      )
    },
    readSamples: queryForecastSamples,
    readImpacts: queryForecastItemImpacts,
    persistCompletion: async (investigation, result, summaries) => {
      const token = `forecast:${investigation.id}:aggregate`
      await insertForecastSummaries(
        summaries.map((summary) => ({
          project_id: investigation.projectId,
          investigation_id: investigation.id,
          scenario_id: summary.scenarioId,
          on_time_probability: summary.probability,
          target_date: investigation.targetDate,
          p50_completion_date: summary.p50,
          p80_completion_date: summary.p80,
          p95_completion_date: summary.p95,
          sample_count: summary.sampleCount,
        })),
        { deduplicationToken: `${token}:summaries` },
      )
      await insertInvestigationEvents(
        [
          {
            event_id: deterministicDemoUuid(
              `forecast:investigation-event:${investigation.id}`,
            ),
            project_id: investigation.projectId,
            investigation_id: investigation.id,
            intent_kind: investigation.parsedIntent.kind as
              | 'deadline_probability'
              | 'blocker_analysis'
              | 'scope_to_confidence'
              | 'compare_scenarios',
            selected_scenario_ids: investigation.selectedScenarioIds,
            latency_ms: 0,
            outcome: 'completed',
            properties: {
              synthetic: true,
              sampleCount: result.sampleCount,
              seed: result.seed,
            },
            occurred_at: new Date().toISOString(),
          },
        ],
        { deduplicationToken: `${token}:investigation-event` },
      )
      await updateInvestigation(investigation.id, {
        status: 'completed',
        finalResult: result,
        completedAt: new Date(),
        failureCode: null,
        failureDetail: null,
      })
    },
    markFailed: async (id, code, detail) => {
      await updateInvestigation(id, {
        status: 'failed',
        failureCode: code,
        failureDetail: detail,
        completedAt: new Date(),
      })
    },
    reportProgress: (progress) => {
      metadata
        .set('stage', progress.stage)
        .set('percentage', progress.percentage)
        .set('completedShards', progress.completedShards)
        .set('totalShards', progress.totalShards)
        .set('scenarioLabel', progress.scenarioLabel)
        .set('projectId', progress.projectId)
        .set('investigationId', progress.investigationId)
        .set('seed', progress.seed)
    },
    tagRun: (values) => tags.add(values),
  }
}

export const forecastReleaseTask = task({
  id: 'forecast-release',
  maxDuration: 120,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 15_000,
    randomize: true,
  },
  run: async (payload: { investigationId: string }, { ctx }) => {
    const output = await executeForecastWorkflow(
      payload.investigationId,
      ctx.run.id,
      taskDependencies(),
    )
    logger.info('Forecast release completed', {
      runId: ctx.run.id,
      investigationId: payload.investigationId,
      completedShards: output.completedShards,
      totalShards: output.totalShards,
    })
    return output
  },
})
