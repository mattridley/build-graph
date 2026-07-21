import { randomUUID } from 'node:crypto'

import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getPostgres, type PostgresConnection } from '@/lib/clients'
import {
  forecastResultSchema,
  investigationIntentSchema,
} from '@/lib/contracts/forecast'
import { assertAcyclic } from '@/lib/postgres/graph'
import {
  dependencies,
  investigations,
  outboxEvents,
  projects,
  scenarios,
  scopeGroups,
  workItems,
} from '@/lib/postgres/schema'

const uuidSchema = z.uuid()
const uuidArraySchema = z.array(uuidSchema)
const outboxPayloadSchema = z.record(z.string(), z.unknown())

export class RecordNotFoundError extends Error {
  constructor(record: string, id: string) {
    super(`${record} ${id} was not found`)
    this.name = 'RecordNotFoundError'
  }
}

export class DependencyEndpointError extends Error {
  constructor() {
    super('Both dependency endpoints must belong to the selected project')
    this.name = 'DependencyEndpointError'
  }
}

function connection(override?: PostgresConnection) {
  return override ?? getPostgres()
}

export async function loadProjectGraph(
  projectId: string,
  override?: PostgresConnection,
) {
  const validProjectId = uuidSchema.parse(projectId)
  const db = connection(override).db
  const [projectRows, groups, items, edges] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, validProjectId)).limit(1),
    db
      .select()
      .from(scopeGroups)
      .where(eq(scopeGroups.projectId, validProjectId))
      .orderBy(asc(scopeGroups.displayOrder)),
    db.select().from(workItems).where(eq(workItems.projectId, validProjectId)),
    db
      .select()
      .from(dependencies)
      .where(eq(dependencies.projectId, validProjectId)),
  ])
  const project = projectRows[0]
  if (!project) throw new RecordNotFoundError('Project', validProjectId)
  assertAcyclic(
    items.map((item) => item.id),
    edges,
  )
  return { project, scopeGroups: groups, workItems: items, dependencies: edges }
}

export async function readScenarios(
  projectId: string,
  override?: PostgresConnection,
) {
  const validProjectId = uuidSchema.parse(projectId)
  const rows = await connection(override)
    .db.select()
    .from(scenarios)
    .where(eq(scenarios.projectId, validProjectId))
    .orderBy(asc(scenarios.createdAt))

  return rows.map((row) => ({
    ...row,
    excludedScopeGroupIds: uuidArraySchema.parse(row.excludedScopeGroupIds),
    resolvedBlockerIds: uuidArraySchema.parse(row.resolvedBlockerIds),
  }))
}

const createInvestigationSchema = z.object({
  id: uuidSchema.optional(),
  projectId: uuidSchema,
  originalQuestion: z.string().trim().min(1).max(2_000),
  parsedIntent: investigationIntentSchema,
  targetDate: z.iso.date(),
  selectedScenarioIds: uuidArraySchema.default([]),
  triggerRunId: z.string().trim().min(1).max(500).optional(),
  randomSeed: z.number().int().min(-2_147_483_648).max(2_147_483_647),
})

export type CreateInvestigationInput = z.input<typeof createInvestigationSchema>

export async function createInvestigation(
  input: CreateInvestigationInput,
  override?: PostgresConnection,
) {
  const value = createInvestigationSchema.parse(input)
  return connection(override).transaction(async (tx) => {
    const [created] = await tx.insert(investigations).values(value).returning()
    if (!created) throw new Error('Investigation insert returned no row')
    await tx.insert(outboxEvents).values({
      aggregateType: 'investigation',
      aggregateId: created.id,
      eventType: 'investigation.created',
      payload: outboxPayloadSchema.parse({
        investigationId: created.id,
        projectId: created.projectId,
        status: created.status,
      }),
    })
    return created
  })
}

const updateInvestigationSchema = z
  .object({
    status: z.enum(['queued', 'running', 'completed', 'failed']).optional(),
    triggerRunId: z.string().trim().min(1).max(500).nullable().optional(),
    finalResult: forecastResultSchema.nullable().optional(),
    failureCode: z.string().trim().min(1).max(100).nullable().optional(),
    failureDetail: z.string().trim().min(1).max(1_000).nullable().optional(),
    startedAt: z.date().nullable().optional(),
    completedAt: z.date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No changes supplied')

export async function updateInvestigation(
  investigationId: string,
  patch: z.input<typeof updateInvestigationSchema>,
  override?: PostgresConnection,
) {
  const id = uuidSchema.parse(investigationId)
  const value = updateInvestigationSchema.parse(patch)
  return connection(override).transaction(async (tx) => {
    const [updated] = await tx
      .update(investigations)
      .set({ ...value, updatedAt: new Date() })
      .where(eq(investigations.id, id))
      .returning()
    if (!updated) throw new RecordNotFoundError('Investigation', id)
    await tx.insert(outboxEvents).values({
      aggregateType: 'investigation',
      aggregateId: id,
      eventType: 'investigation.updated',
      payload: outboxPayloadSchema.parse({
        investigationId: id,
        projectId: updated.projectId,
        status: updated.status,
      }),
    })
    return updated
  })
}

export async function getInvestigation(
  investigationId: string,
  override?: PostgresConnection,
) {
  const id = uuidSchema.parse(investigationId)
  const [row] = await connection(override)
    .db.select()
    .from(investigations)
    .where(eq(investigations.id, id))
    .limit(1)
  if (!row) throw new RecordNotFoundError('Investigation', id)
  return {
    ...row,
    parsedIntent: investigationIntentSchema.parse(row.parsedIntent),
    selectedScenarioIds: uuidArraySchema.parse(row.selectedScenarioIds),
    finalResult:
      row.finalResult === null
        ? null
        : forecastResultSchema.parse(row.finalResult),
  }
}

const dependencySchema = z.object({
  projectId: uuidSchema,
  predecessorId: uuidSchema,
  successorId: uuidSchema,
})

export async function createDependency(
  input: z.input<typeof dependencySchema>,
  override?: PostgresConnection,
) {
  const edge = dependencySchema.parse(input)
  return connection(override).transaction(async (tx) => {
    const [items, existingEdges] = await Promise.all([
      tx
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.projectId, edge.projectId),
            inArray(workItems.id, [edge.predecessorId, edge.successorId]),
          ),
        ),
      tx
        .select({
          predecessorId: dependencies.predecessorId,
          successorId: dependencies.successorId,
        })
        .from(dependencies)
        .where(eq(dependencies.projectId, edge.projectId)),
    ])
    if (new Set(items.map((item) => item.id)).size !== 2) {
      throw new DependencyEndpointError()
    }
    assertAcyclic(
      items.map((item) => item.id),
      [...existingEdges, edge],
    )
    const [created] = await tx.insert(dependencies).values(edge).returning()
    await tx.insert(outboxEvents).values({
      aggregateType: 'project',
      aggregateId: edge.projectId,
      eventType: 'dependency.created',
      payload: outboxPayloadSchema.parse(edge),
    })
    return created
  })
}

export async function removeDependency(
  input: z.input<typeof dependencySchema>,
  override?: PostgresConnection,
) {
  const edge = dependencySchema.parse(input)
  return connection(override).transaction(async (tx) => {
    const [removed] = await tx
      .delete(dependencies)
      .where(
        and(
          eq(dependencies.projectId, edge.projectId),
          eq(dependencies.predecessorId, edge.predecessorId),
          eq(dependencies.successorId, edge.successorId),
        ),
      )
      .returning()
    if (!removed)
      throw new RecordNotFoundError(
        'Dependency',
        `${edge.predecessorId}:${edge.successorId}`,
      )
    await tx.insert(outboxEvents).values({
      aggregateType: 'project',
      aggregateId: edge.projectId,
      eventType: 'dependency.removed',
      payload: outboxPayloadSchema.parse(edge),
    })
    return removed
  })
}

export interface ClaimOutboxOptions {
  limit?: number
  claimTtlMs?: number
  claimToken?: string
}

export async function claimOutboxEvents(
  options: ClaimOutboxOptions = {},
  override?: PostgresConnection,
) {
  const limit = z
    .number()
    .int()
    .min(1)
    .max(500)
    .parse(options.limit ?? 100)
  const claimTtlMs = z
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .parse(options.claimTtlMs ?? 60_000)
  const claimToken = uuidSchema.parse(options.claimToken ?? randomUUID())
  const staleBefore = new Date(Date.now() - claimTtlMs)

  const rows = await connection(override).transaction(async (tx) => {
    const candidates = await tx
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          isNull(outboxEvents.dispatchedAt),
          or(
            isNull(outboxEvents.claimedAt),
            lt(outboxEvents.claimedAt, staleBefore),
          ),
        ),
      )
      .orderBy(asc(outboxEvents.occurredAt))
      .limit(limit)
      .for('update', { skipLocked: true })
    if (candidates.length === 0) return []
    return tx
      .update(outboxEvents)
      .set({
        claimedAt: new Date(),
        claimToken,
        attemptCount: sql`${outboxEvents.attemptCount} + 1`,
        lastError: null,
      })
      .where(
        inArray(
          outboxEvents.id,
          candidates.map((candidate) => candidate.id),
        ),
      )
      .returning()
  })

  return {
    claimToken,
    events: rows.map((row) => ({
      ...row,
      payload: outboxPayloadSchema.parse(row.payload),
    })),
  }
}

export async function markOutboxDispatched(
  claimToken: string,
  override?: PostgresConnection,
) {
  return connection(override)
    .db.update(outboxEvents)
    .set({
      dispatchedAt: new Date(),
      claimedAt: null,
      claimToken: null,
      lastError: null,
    })
    .where(
      and(
        eq(outboxEvents.claimToken, uuidSchema.parse(claimToken)),
        isNull(outboxEvents.dispatchedAt),
      ),
    )
    .returning({ id: outboxEvents.id })
}

export async function releaseOutboxClaim(
  claimToken: string,
  errorDetail: string,
  override?: PostgresConnection,
) {
  const safeError = z.string().trim().min(1).max(1_000).parse(errorDetail)
  return connection(override)
    .db.update(outboxEvents)
    .set({ claimedAt: null, claimToken: null, lastError: safeError })
    .where(
      and(
        eq(outboxEvents.claimToken, uuidSchema.parse(claimToken)),
        isNull(outboxEvents.dispatchedAt),
      ),
    )
    .returning({ id: outboxEvents.id })
}
