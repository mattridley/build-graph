import { describe, expect, it } from 'vitest'

import {
  createOutboxDeduplicationToken,
  normalizeOutboxEvent,
  type OutboxRecord,
} from '@/lib/outbox/contracts'

const eventId = '00000000-0000-4000-8000-000000000001'
const projectId = '00000000-0000-4000-8000-000000000002'
const itemId = '00000000-0000-4000-8000-000000000003'

function event(payload: Record<string, unknown>): OutboxRecord {
  return {
    id: eventId,
    aggregateType: 'work_item',
    aggregateId: itemId,
    eventType: 'work_item.changed',
    payload,
    occurredAt: new Date('2026-07-21T08:00:00.000Z'),
    dispatchedAt: null,
    claimedAt: null,
    claimToken: null,
    attemptCount: 0,
    lastError: null,
  }
}

describe('outbox contracts', () => {
  it('normalizes a versioned work-item payload without changing IDs or dates', () => {
    const normalized = normalizeOutboxEvent(
      event({
        version: 1,
        projectId,
        itemId,
        eventKind: 'completed',
        itemKind: 'task',
        status: 'done',
        startingStatus: 'in_progress',
        size: 'm',
        progressPercent: 100,
        durationHours: 8,
        source: 'application',
        actor: null,
        properties: {},
      }),
    )

    expect(normalized).toMatchObject({
      table: 'delivery_events',
      eventId,
      value: {
        event_id: eventId,
        project_id: projectId,
        item_id: itemId,
        occurred_at: '2026-07-21T08:00:00.000Z',
      },
    })
  })

  it('derives the same token regardless of object key insertion order', () => {
    const left = event({ version: 1, projectId, itemId, value: 1 })
    const right = event({ itemId, value: 1, projectId, version: 1 })
    expect(createOutboxDeduplicationToken([left])).toBe(
      createOutboxDeduplicationToken([right]),
    )
  })
})
