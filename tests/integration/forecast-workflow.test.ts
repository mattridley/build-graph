import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getClickHouse } from '@/lib/clients'
import {
  insertForecastSummaries,
  queryForecastItemImpacts,
  queryForecastSamples,
  queryForecastSummaries,
} from '@/lib/clickhouse/storage'
import { runSimulationShard } from '@/lib/forecast/simulation-workflow'
import {
  workflowEngineInput,
  workflowScenario,
} from '@/lib/forecast/workflow-test-fixture'

const run =
  process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

run('durable forecast shards', () => {
  const input = workflowEngineInput()
  const client = getClickHouse()

  async function cleanup() {
    for (const table of [
      'forecast_samples',
      'forecast_item_impacts',
      'forecast_summaries',
      'investigation_events',
    ]) {
      await client.command({
        query: `ALTER TABLE ${table} DELETE WHERE investigation_id = {investigationId:UUID}`,
        query_params: { investigationId: input.investigationId },
        clickhouse_settings: { mutations_sync: '2' },
      })
    }
  }

  beforeAll(cleanup)
  afterAll(cleanup)

  it('persists exactly 2,500 idempotent samples, impacts, and one summary', async () => {
    for (let shardIndex = 0; shardIndex < 10; shardIndex++) {
      const summary = await runSimulationShard({
        input,
        scenario: workflowScenario,
        shardIndex,
        firstSample: shardIndex * 250,
        sampleCount: 250,
        baseSeed: input.seed,
      })
      expect(summary.inserted).toBe(250)
    }
    for (let shardIndex = 0; shardIndex < 10; shardIndex++) {
      const summary = await runSimulationShard({
        input,
        scenario: workflowScenario,
        shardIndex,
        firstSample: shardIndex * 250,
        sampleCount: 250,
        baseSeed: input.seed,
      })
      expect(summary.inserted).toBe(0)
    }
    const samples = await queryForecastSamples(
      input.investigationId,
      workflowScenario.id,
    )
    const impacts = await queryForecastItemImpacts(
      input.investigationId,
      workflowScenario.id,
    )
    expect(samples).toHaveLength(2_500)
    expect(new Set(samples.map((sample) => sample.sample_number)).size).toBe(
      2_500,
    )
    expect(impacts.length).toBeGreaterThan(0)
    expect(impacts.every((impact) => impact.sample_count === 2_500)).toBe(true)

    const summaryRow = {
      project_id: input.project.id,
      investigation_id: input.investigationId,
      scenario_id: workflowScenario.id,
      on_time_probability: 1,
      target_date: input.project.targetDate,
      p50_completion_date: input.project.targetDate,
      p80_completion_date: input.project.targetDate,
      p95_completion_date: input.project.targetDate,
      sample_count: 2_500,
    }
    const token = `forecast:${input.investigationId}:integration-summary`
    await insertForecastSummaries([summaryRow], {
      deduplicationToken: token,
    })
    await insertForecastSummaries([summaryRow], {
      deduplicationToken: token,
    })
    await expect(
      queryForecastSummaries(input.investigationId),
    ).resolves.toHaveLength(1)
  }, 60_000)
})
