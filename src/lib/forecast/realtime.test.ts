import { tasks } from '@trigger.dev/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  parseForecastRealtimeMetadata,
  startForecastRelease,
} from '@/lib/forecast/realtime'
import { workflowIds } from '@/lib/forecast/workflow-test-fixture'

vi.mock('@trigger.dev/sdk', () => ({
  tasks: { trigger: vi.fn() },
}))

describe('forecast realtime boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns only the run-scoped public handle from a backend trigger', async () => {
    vi.mocked(tasks.trigger).mockResolvedValue({
      id: 'run_123',
      publicAccessToken: 'public_run_token',
      taskIdentifier: 'forecast-release',
    } as never)
    await expect(
      startForecastRelease(workflowIds.investigation),
    ).resolves.toEqual({
      runId: 'run_123',
      publicAccessToken: 'public_run_token',
    })
    expect(tasks.trigger).toHaveBeenCalledWith(
      'forecast-release',
      { investigationId: workflowIds.investigation },
      expect.objectContaining({
        idempotencyKey: [
          'forecast-release',
          workflowIds.investigation,
          'initial',
        ],
        idempotencyKeyTTL: '7d',
      }),
    )
  })

  it('parses a typed frontend-safe progress snapshot and strips unknown fields', () => {
    const parsed = parseForecastRealtimeMetadata({
      stage: 'simulating',
      percentage: 42,
      completedShards: 4,
      totalShards: 10,
      scenarioLabel: 'Baseline',
      projectId: workflowIds.project,
      investigationId: workflowIds.investigation,
      seed: 123_456,
      DATABASE_URL: 'must-not-cross-boundary',
      rawSql: 'SELECT secret',
    })
    expect(parsed).toEqual({
      stage: 'simulating',
      percentage: 42,
      completedShards: 4,
      totalShards: 10,
      scenarioLabel: 'Baseline',
      projectId: workflowIds.project,
      investigationId: workflowIds.investigation,
      seed: 123_456,
    })
    expect(parsed).not.toHaveProperty('DATABASE_URL')
    expect(parsed).not.toHaveProperty('rawSql')
  })
})
