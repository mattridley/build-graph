import 'server-only'

import { createHash } from 'node:crypto'

import type { ClickHouseClient } from '@clickhouse/client'

import { getClickHouse } from '@/lib/clients'
import {
  findExistingForecastSampleNumbers,
  insertForecastItemImpacts,
  insertForecastSamples,
} from '@/lib/clickhouse/storage'
import { simulateScenarioSamples } from '@/lib/forecast/engine'
import {
  simulationShardPayloadSchema,
  simulationShardSummarySchema,
  type SimulationShardPayload,
  type SimulationShardSummary,
} from '@/lib/forecast/workflow-contracts'

export class ForecastShardConsistencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForecastShardConsistencyError'
  }
}

export interface SimulationShardDependencies {
  findExistingSampleNumbers(
    investigationId: string,
    scenarioId: string,
    firstSample: number,
    lastSample: number,
  ): Promise<Set<number>>
  insertImpacts(
    rows: Parameters<typeof insertForecastItemImpacts>[0],
    token: string,
  ): Promise<void>
  insertSamples(
    rows: Parameters<typeof insertForecastSamples>[0],
    token: string,
  ): Promise<void>
}

function defaultDependencies(
  client: ClickHouseClient = getClickHouse(),
): SimulationShardDependencies {
  return {
    findExistingSampleNumbers: (
      investigationId,
      scenarioId,
      firstSample,
      lastSample,
    ) =>
      findExistingForecastSampleNumbers(
        investigationId,
        scenarioId,
        firstSample,
        lastSample,
        client,
      ),
    insertImpacts: (rows, token) =>
      insertForecastItemImpacts(rows, {
        client,
        chunkSize: 1_000,
        deduplicationToken: token,
      }),
    insertSamples: (rows, token) =>
      insertForecastSamples(rows, {
        client,
        chunkSize: 250,
        deduplicationToken: token,
      }),
  }
}

function checksumSamples(samples: ReturnType<typeof simulateScenarioSamples>) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        samples.map((sample) => [
          sample.sampleIndex,
          sample.completionAt,
          sample.criticalPathIds,
        ]),
      ),
    )
    .digest('hex')
}

export async function runSimulationShard(
  rawPayload: SimulationShardPayload,
  dependencies: SimulationShardDependencies = defaultDependencies(),
): Promise<SimulationShardSummary> {
  const payload = simulationShardPayloadSchema.parse(rawPayload)
  if (payload.baseSeed !== payload.input.seed) {
    throw new ForecastShardConsistencyError(
      'Shard base seed does not match the immutable simulation input',
    )
  }
  const lastSample = payload.firstSample + payload.sampleCount - 1
  const existing = await dependencies.findExistingSampleNumbers(
    payload.input.investigationId,
    payload.scenario.id,
    payload.firstSample,
    lastSample,
  )
  if (existing.size !== 0 && existing.size !== payload.sampleCount) {
    throw new ForecastShardConsistencyError(
      `Forecast shard ${payload.shardIndex} is only partially durable`,
    )
  }
  const samples = simulateScenarioSamples(
    payload.input,
    payload.scenario,
    payload.firstSample,
    payload.sampleCount,
  )
  const checksum = checksumSamples(samples)
  if (existing.size === payload.sampleCount) {
    return simulationShardSummarySchema.parse({
      scenarioId: payload.scenario.id,
      shardIndex: payload.shardIndex,
      firstSample: payload.firstSample,
      sampleCount: payload.sampleCount,
      inserted: 0,
      checksum,
    })
  }

  const activeNodeIds = new Set(
    samples.flatMap((sample) => sample.criticalPathIds),
  )
  const impacts = [...activeNodeIds].map((itemId) => {
    let criticalCount = 0
    let totalDelay = 0
    for (const sample of samples) {
      if (sample.criticalPathIds.includes(itemId)) criticalCount++
      totalDelay +=
        sample.nodeDelays.find((delay) => delay.itemId === itemId)
          ?.durationHours ?? 0
    }
    return {
      project_id: payload.input.project.id,
      investigation_id: payload.input.investigationId,
      scenario_id: payload.scenario.id,
      item_id: itemId,
      criticality_frequency: criticalCount / payload.sampleCount,
      expected_delay_hours: totalDelay / payload.sampleCount,
      sample_count: payload.sampleCount,
    }
  })
  const sampleRows = samples.map((sample) => ({
    project_id: payload.input.project.id,
    investigation_id: payload.input.investigationId,
    scenario_id: payload.scenario.id,
    sample_number: sample.sampleIndex,
    completion_at: new Date(sample.completionAt).toISOString(),
    sampled_critical_path: sample.criticalPathIds,
  }))
  const token = `forecast:${payload.input.investigationId}:${payload.scenario.id}:${payload.shardIndex}`
  // Impacts are written before samples; the sample range is the durable shard
  // completion marker used by retries.
  await dependencies.insertImpacts(impacts, `${token}:impacts`)
  await dependencies.insertSamples(sampleRows, `${token}:samples`)
  return simulationShardSummarySchema.parse({
    scenarioId: payload.scenario.id,
    shardIndex: payload.shardIndex,
    firstSample: payload.firstSample,
    sampleCount: payload.sampleCount,
    inserted: payload.sampleCount,
    checksum,
  })
}
