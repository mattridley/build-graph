import type { ClickHouseClient } from '@clickhouse/client'
import { describe, expect, it, vi } from 'vitest'

import { queryCycleTimeQuantiles } from '@/lib/clickhouse/analytics'

describe('analytical fallback queries', () => {
  it('falls back from exact project history to the calibrated cohort', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue([]) })
      .mockResolvedValueOnce({
        json: vi
          .fn()
          .mockResolvedValue([{ p25: 2, p50: 4, p90: 8, sample_count: 10 }]),
      })
    const client = { query } as unknown as ClickHouseClient
    const result = await queryCycleTimeQuantiles(
      {
        projectId: '00000000-0000-4000-8000-000000000001',
        itemKind: 'task',
        size: 'm',
        startingStatus: 'todo',
      },
      client,
    )

    expect(result).toMatchObject({ fallbackLevel: 'cohort', p50: 4 })
    expect(query.mock.calls[0]?.[0].query).toContain('{size:String}')
    expect(query.mock.calls[0]?.[0].query).not.toContain(
      '00000000-0000-4000-8000-000000000001',
    )
    expect(query.mock.calls[1]?.[0].query_params).toEqual({
      size: 'm',
    })
  })

  it('uses project-kind history when the cohort is also empty', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue([]) })
      .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue([]) })
      .mockResolvedValueOnce({
        json: vi
          .fn()
          .mockResolvedValue([{ p25: 2, p50: 4, p90: 8, sample_count: 10 }]),
      })
    const client = { query } as unknown as ClickHouseClient
    const result = await queryCycleTimeQuantiles(
      {
        projectId: '00000000-0000-4000-8000-000000000001',
        itemKind: 'task',
        size: 'm',
        startingStatus: 'todo',
      },
      client,
    )

    expect(result).toMatchObject({ fallbackLevel: 'kind', p50: 4 })
    expect(query.mock.calls[2]?.[0].query_params).toEqual({
      projectId: '00000000-0000-4000-8000-000000000001',
      itemKind: 'task',
    })
  })
})
