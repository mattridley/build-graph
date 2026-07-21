import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import { getClickHouse } from '@/lib/clients'
import {
  queryBlockedDurationQuantiles,
  queryCiWorkflowMetrics,
  queryCycleTimeQuantiles,
  queryDailyThroughput,
} from '@/lib/clickhouse/analytics'
import {
  findExistingProjectionEventIds,
  insertCiRunEvents,
  insertDeliveryEvents,
} from '@/lib/clickhouse/storage'
import type { OutboxRecord } from '@/lib/outbox/contracts'
import { syncOutboxBatch, type SyncOutboxDependencies } from '@/lib/outbox/sync'

const run =
  process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

run('ClickHouse analytical projections', () => {
  const projectId = randomUUID()
  const workflow = `workflow-${projectId}`

  afterAll(async () => {
    const client = getClickHouse()
    for (const table of ['delivery_events', 'ci_run_events']) {
      await client.command({
        query: `ALTER TABLE ${table} DELETE WHERE project_id = {projectId:UUID}`,
        query_params: { projectId },
      })
    }
  })

  it('returns quantiles, rates, and throughput for a known fixture', async () => {
    const occurred_at = '2026-07-21T08:00:00.000Z'
    await insertDeliveryEvents(
      [1, 2, 3, 4].map((duration) => ({
        event_id: randomUUID(),
        project_id: projectId,
        item_id: randomUUID(),
        event_kind: 'completed',
        item_kind: 'task' as const,
        status: 'done' as const,
        starting_status: 'in_progress' as const,
        size: 'm' as const,
        progress_percent: 100,
        duration_hours: duration,
        source: 'fixture',
        actor: null,
        properties: {},
        occurred_at,
      })),
    )
    await insertDeliveryEvents(
      [2, 4].map((duration) => ({
        event_id: randomUUID(),
        project_id: projectId,
        item_id: randomUUID(),
        event_kind: 'blocked_duration',
        item_kind: 'task' as const,
        status: 'blocked' as const,
        starting_status: 'blocked' as const,
        size: 'm' as const,
        progress_percent: 50,
        duration_hours: duration,
        source: 'fixture',
        actor: null,
        properties: {},
        occurred_at,
      })),
    )
    await insertCiRunEvents([
      {
        run_id: randomUUID(),
        workflow,
        conclusion: 'success',
        duration_seconds: 10,
        retry_count: 0,
        project_id: projectId,
        item_id: null,
        properties: {},
        started_at: occurred_at,
        completed_at: occurred_at,
      },
      {
        run_id: randomUUID(),
        workflow,
        conclusion: 'failure',
        duration_seconds: 20,
        retry_count: 1,
        project_id: projectId,
        item_id: null,
        properties: {},
        started_at: occurred_at,
        completed_at: occurred_at,
      },
    ])

    const cycle = await queryCycleTimeQuantiles({
      projectId,
      itemKind: 'task',
      size: 'm',
      startingStatus: 'in_progress',
    })
    const blocked = await queryBlockedDurationQuantiles(projectId, 'task')
    const ci = await queryCiWorkflowMetrics(workflow)
    const throughput = await queryDailyThroughput(
      projectId,
      '2026-07-21',
      '2026-07-21',
    )

    expect(cycle).toMatchObject({ fallbackLevel: 'exact', sample_count: 4 })
    expect(cycle?.p50).toBeGreaterThanOrEqual(2)
    expect(blocked).toMatchObject({ sample_count: 2 })
    expect(ci).toMatchObject({
      success_rate: 0.5,
      retry_rate: 0.5,
      run_count: 2,
    })
    expect(throughput).toEqual([
      { day: '2026-07-21', item_kind: 'task', completed_count: 4 },
    ])
  })

  it('does not duplicate a replayed outbox event or its aggregate', async () => {
    const eventId = randomUUID()
    const itemId = randomUUID()
    const event: OutboxRecord = {
      id: eventId,
      aggregateType: 'work_item',
      aggregateId: itemId,
      eventType: 'work_item.changed',
      payload: {
        version: 1,
        projectId,
        itemId,
        eventKind: 'completed',
        itemKind: 'task',
        status: 'done',
        startingStatus: 'todo',
        size: 'xl',
        progressPercent: 100,
        durationHours: 8,
      },
      occurredAt: new Date('2026-07-21T09:00:00.000Z'),
      dispatchedAt: null,
      claimedAt: new Date(),
      claimToken: randomUUID(),
      attemptCount: 1,
      lastError: null,
    }
    const dependencies: SyncOutboxDependencies = {
      claim: async () => ({ claimToken: event.claimToken!, events: [event] }),
      findExisting: (table, ids) => findExistingProjectionEventIds(table, ids),
      insertDelivery: (rows, token) =>
        insertDeliveryEvents(rows as never[], { deduplicationToken: token }),
      insertInvestigations: async () => undefined,
      markDispatched: async () => [{ id: eventId }],
      release: async () => [{ id: eventId }],
    }

    const first = await syncOutboxBatch({
      correlationId: 'first',
      dependencies,
    })
    const replay = await syncOutboxBatch({
      correlationId: 'replay',
      dependencies,
    })
    const result = await getClickHouse().query({
      query:
        'SELECT count() AS count FROM delivery_events WHERE event_id = {eventId:UUID}',
      query_params: { eventId },
      format: 'JSONEachRow',
    })
    const sourceRows = (await result.json()) as Array<{ count: string }>
    const cycle = await queryCycleTimeQuantiles({
      projectId,
      itemKind: 'task',
      size: 'xl',
      startingStatus: 'todo',
    })

    expect(first.inserted).toBe(1)
    expect(replay).toMatchObject({ inserted: 0, skipped: 1 })
    expect(Number(sourceRows[0]?.count)).toBe(1)
    expect(cycle).toMatchObject({ sample_count: 1 })
  })
})
