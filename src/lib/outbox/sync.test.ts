import { describe, expect, it, vi } from 'vitest'

import type { OutboxRecord } from '@/lib/outbox/contracts'
import {
  syncOutboxBatch,
  TransientOutboxError,
  type SyncOutboxDependencies,
} from '@/lib/outbox/sync'

const event: OutboxRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  aggregateType: 'work_item',
  aggregateId: '00000000-0000-4000-8000-000000000003',
  eventType: 'work_item.changed',
  payload: {
    version: 1,
    projectId: '00000000-0000-4000-8000-000000000002',
    itemId: '00000000-0000-4000-8000-000000000003',
    eventKind: 'completed',
    itemKind: 'task',
    status: 'done',
    startingStatus: 'in_progress',
    size: 'm',
    progressPercent: 100,
    durationHours: 8,
  },
  occurredAt: new Date('2026-07-21T08:00:00.000Z'),
  dispatchedAt: null,
  claimedAt: new Date('2026-07-21T08:01:00.000Z'),
  claimToken: '00000000-0000-4000-8000-000000000004',
  attemptCount: 1,
  lastError: null,
}

function dependencies(
  overrides: Partial<SyncOutboxDependencies> = {},
): SyncOutboxDependencies {
  return {
    claim: vi.fn().mockResolvedValue({
      claimToken: event.claimToken,
      events: [event],
    }),
    findExisting: vi.fn().mockResolvedValue(new Set()),
    insertDelivery: vi.fn().mockResolvedValue(undefined),
    insertInvestigations: vi.fn().mockResolvedValue(undefined),
    markDispatched: vi.fn().mockResolvedValue([{ id: event.id }]),
    release: vi.fn().mockResolvedValue([{ id: event.id }]),
    ...overrides,
  }
}

describe('outbox synchronization', () => {
  it('marks rows only after acknowledged inserts', async () => {
    const deps = dependencies()
    const result = await syncOutboxBatch({
      correlationId: 'run-1',
      dependencies: deps,
    })

    expect(result).toMatchObject({
      claimed: 1,
      inserted: 1,
      skipped: 0,
      failed: 0,
      dispatched: 1,
    })
    expect(
      vi.mocked(deps.markDispatched).mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      vi.mocked(deps.insertDelivery).mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('skips an already projected event but still acknowledges its outbox row', async () => {
    const deps = dependencies({
      findExisting: vi.fn().mockResolvedValue(new Set([event.id])),
    })
    const result = await syncOutboxBatch({
      correlationId: 'run-replay',
      dependencies: deps,
    })

    expect(result).toMatchObject({ inserted: 0, skipped: 1, dispatched: 1 })
    expect(deps.insertDelivery).not.toHaveBeenCalled()
  })

  it('releases and retries transient failures', async () => {
    const deps = dependencies({
      insertDelivery: vi.fn().mockRejectedValue(new Error('HTTP 503 timeout')),
    })
    await expect(
      syncOutboxBatch({ correlationId: 'run-transient', dependencies: deps }),
    ).rejects.toBeInstanceOf(TransientOutboxError)
    expect(deps.release).toHaveBeenCalledWith(
      event.claimToken,
      expect.stringContaining('OUTBOX_TRANSIENT'),
    )
    expect(deps.markDispatched).not.toHaveBeenCalled()
  })

  it('records permanent failures without dispatching', async () => {
    const deps = dependencies({
      insertDelivery: vi.fn().mockRejectedValue(new Error('invalid column')),
    })
    const result = await syncOutboxBatch({
      correlationId: 'run-permanent',
      dependencies: deps,
    })
    expect(result).toMatchObject({
      failed: 1,
      dispatched: 0,
      failureCode: 'OUTBOX_PERMANENT',
    })
    expect(deps.release).toHaveBeenCalled()
  })
})
