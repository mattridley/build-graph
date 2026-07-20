import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import { getClickHouse, resetDatabaseClientsForTests } from '@/lib/clients'
import {
  insertCiRunEvents,
  insertDeliveryEvents,
  insertForecastItemImpacts,
  insertForecastSamples,
  insertForecastSummaries,
  insertInvestigationEvents,
  queryCiRunEvents,
  queryDeliveryEvents,
  queryForecastItemImpacts,
  queryForecastSamples,
  queryForecastSummaries,
  queryInvestigationEvents,
} from '@/lib/clickhouse/storage'

const run =
  process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

run('ClickHouse analytical storage', () => {
  const projectId = randomUUID()
  const itemId = randomUUID()
  const investigationId = randomUUID()
  const scenarioId = randomUUID()
  const now = '2026-07-20T12:00:00.000Z'

  afterAll(async () => {
    const client = getClickHouse()
    for (const table of [
      'delivery_events',
      'ci_run_events',
      'forecast_samples',
      'forecast_item_impacts',
      'forecast_summaries',
      'investigation_events',
    ]) {
      await client.command({
        query: `ALTER TABLE ${table} DELETE WHERE project_id = {projectId:UUID}`,
        query_params: { projectId },
      })
    }
    await resetDatabaseClientsForTests()
  })

  it('inserts and queries every analytical table through typed modules', async () => {
    const options = { deduplicationToken: `integration-${projectId}` }
    await insertDeliveryEvents(
      [
        {
          event_id: randomUUID(),
          project_id: projectId,
          item_id: itemId,
          event_kind: 'completed',
          status: 'done',
          size: 's',
          progress_percent: 100,
          duration_hours: 4,
          source: 'test',
          actor: null,
          properties: {},
          occurred_at: now,
        },
      ],
      options,
    )
    await insertCiRunEvents(
      [
        {
          run_id: randomUUID(),
          workflow: 'ci',
          conclusion: 'success',
          duration_seconds: 60,
          retry_count: 0,
          project_id: projectId,
          item_id: itemId,
          properties: {},
          started_at: now,
          completed_at: now,
        },
      ],
      options,
    )
    await insertForecastSamples(
      [
        {
          project_id: projectId,
          investigation_id: investigationId,
          scenario_id: scenarioId,
          sample_number: 0,
          completion_at: now,
          sampled_critical_path: [itemId],
        },
      ],
      options,
    )
    await insertForecastItemImpacts(
      [
        {
          project_id: projectId,
          investigation_id: investigationId,
          scenario_id: scenarioId,
          item_id: itemId,
          criticality_frequency: 0.5,
          expected_delay_hours: 2,
          sample_count: 1,
        },
      ],
      options,
    )
    await insertForecastSummaries(
      [
        {
          project_id: projectId,
          investigation_id: investigationId,
          scenario_id: scenarioId,
          on_time_probability: 0.5,
          target_date: '2026-08-01',
          p50_completion_date: '2026-08-01',
          p80_completion_date: '2026-08-02',
          p95_completion_date: '2026-08-03',
          sample_count: 1,
        },
      ],
      options,
    )
    await insertInvestigationEvents(
      [
        {
          event_id: randomUUID(),
          project_id: projectId,
          investigation_id: investigationId,
          intent_kind: 'deadline_probability',
          selected_scenario_ids: [scenarioId],
          latency_ms: 10,
          outcome: 'completed',
          properties: {},
          occurred_at: now,
        },
      ],
      options,
    )

    expect(await queryDeliveryEvents(projectId)).toHaveLength(1)
    expect(await queryCiRunEvents(projectId)).toHaveLength(1)
    expect(
      await queryForecastSamples(investigationId, scenarioId),
    ).toHaveLength(1)
    expect(
      await queryForecastItemImpacts(investigationId, scenarioId),
    ).toHaveLength(1)
    expect(await queryForecastSummaries(investigationId)).toHaveLength(1)
    expect(await queryInvestigationEvents(investigationId)).toHaveLength(1)
  })
})
