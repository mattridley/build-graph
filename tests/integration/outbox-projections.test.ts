import { randomUUID } from 'node:crypto'

import { count, eq, inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { getPostgres } from '@/lib/clients'
import {
  claimOutboxEvents,
  releaseOutboxClaim,
} from '@/lib/postgres/repositories'
import { outboxEvents, projects } from '@/lib/postgres/schema'

const run =
  process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

run('transactional outbox claims', () => {
  const eventIds = [randomUUID(), randomUUID()]

  afterAll(async () => {
    await getPostgres()
      .db.delete(outboxEvents)
      .where(inArray(outboxEvents.id, eventIds))
  })

  it('rolls back operational state and its outbox row together', async () => {
    const projectId = randomUUID()
    const eventId = randomUUID()
    await expect(
      getPostgres().transaction(async (tx) => {
        await tx.insert(projects).values({
          id: projectId,
          slug: `rollback-${projectId}`,
          name: 'Rollback fixture',
          targetDate: '2026-09-01',
          forecastAnchorAt: new Date('2026-07-21T08:00:00Z'),
        })
        await tx.insert(outboxEvents).values({
          id: eventId,
          aggregateType: 'project',
          aggregateId: projectId,
          eventType: 'project.created',
          payload: { version: 1, projectId },
        })
        throw new Error('force rollback')
      }),
    ).rejects.toThrow('force rollback')

    const [projectCount] = await getPostgres()
      .db.select({ value: count() })
      .from(projects)
      .where(eq(projects.id, projectId))
    const [eventCount] = await getPostgres()
      .db.select({ value: count() })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId))
    expect(projectCount?.value).toBe(0)
    expect(eventCount?.value).toBe(0)
  })

  it('prevents concurrent workers from claiming the same rows', async () => {
    const occurredAt = new Date('2000-01-01T00:00:00Z')
    await getPostgres()
      .db.insert(outboxEvents)
      .values(
        eventIds.map((id) => ({
          id,
          aggregateType: 'work_item',
          aggregateId: randomUUID(),
          eventType: 'work_item.changed',
          payload: { fixture: true },
          occurredAt,
        })),
      )
    const [left, right] = await Promise.all([
      claimOutboxEvents({ limit: 1, claimToken: randomUUID() }),
      claimOutboxEvents({ limit: 1, claimToken: randomUUID() }),
    ])

    expect(left.events).toHaveLength(1)
    expect(right.events).toHaveLength(1)
    expect(left.events[0]?.id).not.toBe(right.events[0]?.id)
    await Promise.all([
      releaseOutboxClaim(left.claimToken, 'TEST_RELEASE'),
      releaseOutboxClaim(right.claimToken, 'TEST_RELEASE'),
    ])
  })
})
