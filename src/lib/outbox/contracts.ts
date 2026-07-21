import { createHash } from 'node:crypto'

import { z } from 'zod'

import {
  deliveryEventSchema,
  investigationEventSchema,
} from '@/lib/clickhouse/storage'
import type { outboxEvents } from '@/lib/postgres/schema'

const uuid = z.uuid()
const version = z.literal(1)
const itemKind = z.enum([
  'requirement',
  'task',
  'pull_request',
  'test',
  'milestone',
])
const itemStatus = z.enum(['todo', 'in_progress', 'blocked', 'done'])
const itemSize = z.enum(['xs', 's', 'm', 'l', 'xl'])
const intentKind = z.enum([
  'deadline_probability',
  'blocker_analysis',
  'scope_to_confidence',
  'compare_scenarios',
])

export const dependencyOutboxPayloadSchema = z.object({
  version,
  projectId: uuid,
  predecessorId: uuid,
  successorId: uuid,
  type: z.literal('finish_to_start'),
})

export const investigationOutboxPayloadSchema = z.object({
  version,
  projectId: uuid,
  investigationId: uuid,
  intentKind,
  selectedScenarioIds: z.array(uuid),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
})

export const workItemOutboxPayloadSchema = z.object({
  version,
  projectId: uuid,
  itemId: uuid,
  eventKind: z.enum([
    'created',
    'updated',
    'deleted',
    'completed',
    'blocked_duration',
  ]),
  itemKind,
  status: itemStatus,
  startingStatus: itemStatus.nullable(),
  size: itemSize,
  progressPercent: z.number().int().min(0).max(100),
  durationHours: z.number().nonnegative().nullable(),
  source: z.string().min(1).default('application'),
  actor: z.string().nullable().default(null),
  properties: z.record(z.string(), z.unknown()).default({}),
})

const eventSchemas = {
  'dependency.created': dependencyOutboxPayloadSchema,
  'dependency.removed': dependencyOutboxPayloadSchema,
  'investigation.created': investigationOutboxPayloadSchema,
  'investigation.updated': investigationOutboxPayloadSchema,
  'work_item.changed': workItemOutboxPayloadSchema,
} as const

export type OutboxRecord = typeof outboxEvents.$inferSelect
export type SupportedOutboxEventType = keyof typeof eventSchemas

export class UnsupportedOutboxEventError extends Error {
  constructor(public readonly eventType: string) {
    super(`Unsupported outbox event type: ${eventType}`)
    this.name = 'UnsupportedOutboxEventError'
  }
}

export function parseOutboxPayload(event: OutboxRecord) {
  if (!(event.eventType in eventSchemas)) {
    throw new UnsupportedOutboxEventError(event.eventType)
  }
  const eventType = event.eventType as SupportedOutboxEventType
  const payload = eventSchemas[eventType].parse(event.payload)
  return { ...event, eventType, payload }
}

export type NormalizedOutboxRow =
  | {
      table: 'delivery_events'
      eventId: string
      value: z.output<typeof deliveryEventSchema>
    }
  | {
      table: 'investigation_events'
      eventId: string
      value: z.output<typeof investigationEventSchema>
    }

export function normalizeOutboxEvent(event: OutboxRecord): NormalizedOutboxRow {
  const parsed = parseOutboxPayload(event)
  const occurredAt = event.occurredAt.toISOString()

  if (parsed.eventType === 'work_item.changed') {
    const payload = workItemOutboxPayloadSchema.parse(parsed.payload)
    return {
      table: 'delivery_events',
      eventId: event.id,
      value: deliveryEventSchema.parse({
        event_id: event.id,
        project_id: payload.projectId,
        item_id: payload.itemId,
        event_kind: payload.eventKind,
        item_kind: payload.itemKind,
        status: payload.status,
        starting_status: payload.startingStatus,
        size: payload.size,
        progress_percent: payload.progressPercent,
        duration_hours: payload.durationHours,
        source: payload.source,
        actor: payload.actor,
        properties: payload.properties,
        occurred_at: occurredAt,
      }),
    }
  }

  if (
    parsed.eventType === 'dependency.created' ||
    parsed.eventType === 'dependency.removed'
  ) {
    const payload = dependencyOutboxPayloadSchema.parse(parsed.payload)
    return {
      table: 'delivery_events',
      eventId: event.id,
      value: deliveryEventSchema.parse({
        event_id: event.id,
        project_id: payload.projectId,
        item_id: payload.successorId,
        event_kind:
          parsed.eventType === 'dependency.created'
            ? 'dependency_created'
            : 'dependency_removed',
        item_kind: null,
        status: null,
        starting_status: null,
        size: null,
        progress_percent: null,
        duration_hours: null,
        source: 'outbox',
        actor: null,
        properties: {
          predecessorId: payload.predecessorId,
          dependencyType: payload.type,
        },
        occurred_at: occurredAt,
      }),
    }
  }

  const payload = investigationOutboxPayloadSchema.parse(parsed.payload)
  return {
    table: 'investigation_events',
    eventId: event.id,
    value: investigationEventSchema.parse({
      event_id: event.id,
      project_id: payload.projectId,
      investigation_id: payload.investigationId,
      intent_kind: payload.intentKind,
      selected_scenario_ids: payload.selectedScenarioIds,
      latency_ms: 0,
      outcome: payload.status,
      properties: { outboxEventType: parsed.eventType },
      occurred_at: occurredAt,
    }),
  }
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

export function createOutboxDeduplicationToken(events: OutboxRecord[]) {
  const ordered = [...events].sort(
    (left, right) =>
      left.occurredAt.getTime() - right.occurredAt.getTime() ||
      left.id.localeCompare(right.id),
  )
  const payload = ordered.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    payload: event.payload,
  }))
  return `outbox:${createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex')}`
}
