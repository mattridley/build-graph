import type { ClickHouseClient } from '@clickhouse/client'
import { describe, expect, it, vi } from 'vitest'

import {
  insertForecastSamples,
  queryForecastSummaries,
} from '@/lib/clickhouse/storage'

const projectId = '00000000-0000-4000-8000-000000000001'
const investigationId = '00000000-0000-4000-8000-000000000002'
const scenarioId = '00000000-0000-4000-8000-000000000003'

describe('ClickHouse storage boundary', () => {
  it('bounds JSONEachRow chunks and derives stable per-chunk tokens', async () => {
    const insert = vi.fn().mockResolvedValue(undefined)
    const client = { insert } as unknown as ClickHouseClient
    const rows = [0, 1, 2].map((sampleNumber) => ({
      project_id: projectId,
      investigation_id: investigationId,
      scenario_id: scenarioId,
      sample_number: sampleNumber,
      completion_at: '2026-08-01T12:00:00.000Z',
      sampled_critical_path: [projectId],
    }))

    await insertForecastSamples(rows, {
      client,
      chunkSize: 2,
      deduplicationToken: 'investigation-2-shard-0',
    })

    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      table: 'forecast_samples',
      format: 'JSONEachRow',
      clickhouse_settings: {
        insert_deduplication_token: 'investigation-2-shard-0:0',
        deduplicate_blocks_in_dependent_materialized_views: 1,
      },
    })
    expect(insert.mock.calls[1]?.[0].clickhouse_settings).toMatchObject({
      insert_deduplication_token: 'investigation-2-shard-0:1',
    })
  })

  it('uses query parameters instead of interpolating identifiers', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([
        {
          project_id: projectId,
          investigation_id: investigationId,
          scenario_id: scenarioId,
          on_time_probability: 0.42,
          target_date: '2026-08-01',
          p50_completion_date: '2026-08-02',
          p80_completion_date: '2026-08-05',
          p95_completion_date: '2026-08-10',
          sample_count: 2500,
        },
      ]),
    })
    const client = { query } as unknown as ClickHouseClient

    await queryForecastSummaries(investigationId, client)

    expect(query.mock.calls[0]?.[0].query).toContain('{investigationId:UUID}')
    expect(query.mock.calls[0]?.[0].query).not.toContain(investigationId)
    expect(query.mock.calls[0]?.[0].query_params).toEqual({ investigationId })
  })
})
