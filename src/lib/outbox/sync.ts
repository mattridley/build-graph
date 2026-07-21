import 'server-only'

import type { ClickHouseClient } from '@clickhouse/client'
import { z } from 'zod'

import { getClickHouse } from '@/lib/clients'
import {
  findExistingProjectionEventIds,
  insertDeliveryEvents,
  insertInvestigationEvents,
} from '@/lib/clickhouse/storage'
import {
  createOutboxDeduplicationToken,
  normalizeOutboxEvent,
  type OutboxRecord,
} from '@/lib/outbox/contracts'
import {
  claimOutboxEvents,
  markOutboxDispatched,
  releaseOutboxClaim,
} from '@/lib/postgres/repositories'

export interface OutboxClaim {
  claimToken: string
  events: OutboxRecord[]
}

export interface SyncOutboxDependencies {
  claim(options: { limit: number; claimTtlMs: number }): Promise<OutboxClaim>
  findExisting(
    table: 'delivery_events' | 'investigation_events',
    eventIds: string[],
  ): Promise<Set<string>>
  insertDelivery(rows: unknown[], token: string): Promise<void>
  insertInvestigations(rows: unknown[], token: string): Promise<void>
  markDispatched(claimToken: string): Promise<Array<{ id: string }>>
  release(claimToken: string, error: string): Promise<Array<{ id: string }>>
}

export interface SyncOutboxResult {
  correlationId: string
  claimToken?: string
  deduplicationToken?: string
  claimed: number
  inserted: number
  skipped: number
  failed: number
  dispatched: number
  failureCode?: string
}

export class TransientOutboxError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TransientOutboxError'
  }
}

function defaultDependencies(
  client: ClickHouseClient = getClickHouse(),
): SyncOutboxDependencies {
  return {
    claim: (options) => claimOutboxEvents(options),
    findExisting: (table, eventIds) =>
      findExistingProjectionEventIds(table, eventIds, client),
    insertDelivery: (rows, token) =>
      insertDeliveryEvents(rows as never[], {
        client,
        deduplicationToken: `${token}:delivery`,
      }),
    insertInvestigations: (rows, token) =>
      insertInvestigationEvents(rows as never[], {
        client,
        deduplicationToken: `${token}:investigations`,
      }),
    markDispatched: (claimToken) => markOutboxDispatched(claimToken),
    release: (claimToken, error) => releaseOutboxClaim(claimToken, error),
  }
}

function normalizeError(error: unknown) {
  const source = error instanceof Error ? error.message : String(error)
  const detail = source
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url]')
    .replace(/https?:\/\/[^\s]+/gi, '[endpoint]')
    .slice(0, 500)
  const transient =
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|timeout|rate.?limit|\b429\b|\b502\b|\b503\b|\b504\b/i.test(
      source,
    )
  return {
    transient,
    code: transient ? 'OUTBOX_TRANSIENT' : 'OUTBOX_PERMANENT',
    detail,
  }
}

export async function syncOutboxBatch(input: {
  correlationId: string
  batchSize?: number
  claimTtlMs?: number
  dependencies?: SyncOutboxDependencies
}): Promise<SyncOutboxResult> {
  const correlationId = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .parse(input.correlationId)
  const batchSize = z
    .number()
    .int()
    .min(1)
    .max(500)
    .parse(input.batchSize ?? 100)
  const claimTtlMs = z
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .parse(input.claimTtlMs ?? 60_000)
  const dependencies = input.dependencies ?? defaultDependencies()
  const claim = await dependencies.claim({ limit: batchSize, claimTtlMs })
  if (claim.events.length === 0) {
    return {
      correlationId,
      claimed: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      dispatched: 0,
    }
  }

  const token = createOutboxDeduplicationToken(claim.events)
  try {
    const normalized = claim.events.map(normalizeOutboxEvent)
    const delivery = normalized.filter((row) => row.table === 'delivery_events')
    const investigations = normalized.filter(
      (row) => row.table === 'investigation_events',
    )
    const [existingDelivery, existingInvestigations] = await Promise.all([
      dependencies.findExisting(
        'delivery_events',
        delivery.map((row) => row.eventId),
      ),
      dependencies.findExisting(
        'investigation_events',
        investigations.map((row) => row.eventId),
      ),
    ])
    const newDelivery = delivery.filter(
      (row) => !existingDelivery.has(row.eventId),
    )
    const newInvestigations = investigations.filter(
      (row) => !existingInvestigations.has(row.eventId),
    )

    if (newDelivery.length > 0) {
      await dependencies.insertDelivery(
        newDelivery.map((row) => row.value),
        token,
      )
    }
    if (newInvestigations.length > 0) {
      await dependencies.insertInvestigations(
        newInvestigations.map((row) => row.value),
        token,
      )
    }
    const dispatched = await dependencies.markDispatched(claim.claimToken)
    const inserted = newDelivery.length + newInvestigations.length
    return {
      correlationId,
      claimToken: claim.claimToken,
      deduplicationToken: token,
      claimed: claim.events.length,
      inserted,
      skipped: claim.events.length - inserted,
      failed: 0,
      dispatched: dispatched.length,
    }
  } catch (error) {
    const normalized = normalizeError(error)
    await dependencies.release(
      claim.claimToken,
      `${normalized.code}: ${normalized.detail}`,
    )
    if (normalized.transient) {
      throw new TransientOutboxError(normalized.code, normalized.detail)
    }
    return {
      correlationId,
      claimToken: claim.claimToken,
      deduplicationToken: token,
      claimed: claim.events.length,
      inserted: 0,
      skipped: 0,
      failed: claim.events.length,
      dispatched: 0,
      failureCode: normalized.code,
    }
  }
}
