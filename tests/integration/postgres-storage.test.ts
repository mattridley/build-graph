import { randomUUID } from 'node:crypto'

import { eq, inArray, or } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getPostgres, resetDatabaseClientsForTests } from '@/lib/clients'
import { GraphCycleError } from '@/lib/postgres/graph'
import {
  createDependency,
  createInvestigation,
  loadProjectGraph,
  readScenarios,
} from '@/lib/postgres/repositories'
import {
  outboxEvents,
  projects,
  scenarios,
  scopeGroups,
  workItems,
} from '@/lib/postgres/schema'

const run =
  process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

run('Postgres operational storage', () => {
  const projectId = randomUUID()
  const scopeGroupId = randomUUID()
  const scenarioId = randomUUID()
  const firstItemId = randomUUID()
  const secondItemId = randomUUID()
  let investigationId: string | undefined

  beforeAll(async () => {
    const { db } = getPostgres()
    await db.insert(projects).values({
      id: projectId,
      slug: `integration-${projectId}`,
      name: 'Integration project',
      targetDate: '2026-09-01',
      forecastAnchorAt: new Date('2026-07-20T09:00:00Z'),
    })
    await db.insert(scopeGroups).values({
      id: scopeGroupId,
      projectId,
      slug: 'core',
      name: 'Core scope',
      classification: 'core',
    })
    await db.insert(scenarios).values({
      id: scenarioId,
      projectId,
      slug: 'baseline',
      name: 'Baseline',
      excludedScopeGroupIds: [],
      resolvedBlockerIds: [],
    })
    await db.insert(workItems).values([
      {
        id: firstItemId,
        projectId,
        scopeGroupId,
        kind: 'task',
        title: 'First',
        size: 's',
      },
      {
        id: secondItemId,
        projectId,
        kind: 'test',
        title: 'Second',
        size: 'm',
      },
    ])
  })

  afterAll(async () => {
    await getPostgres().db.delete(projects).where(eq(projects.id, projectId))
    await getPostgres()
      .db.delete(outboxEvents)
      .where(
        investigationId
          ? or(
              eq(outboxEvents.aggregateId, projectId),
              eq(outboxEvents.aggregateId, investigationId),
            )
          : eq(outboxEvents.aggregateId, projectId),
      )
    await resetDatabaseClientsForTests()
  })

  it('persists and reloads a complete DAG and typed investigation', async () => {
    await createDependency({
      projectId,
      predecessorId: firstItemId,
      successorId: secondItemId,
    })
    const investigation = await createInvestigation({
      projectId,
      originalQuestion: 'Will this ship by September?',
      parsedIntent: { kind: 'deadline_probability' },
      targetDate: '2026-09-01',
      randomSeed: 42,
    })
    investigationId = investigation.id
    const graph = await loadProjectGraph(projectId)
    const savedScenarios = await readScenarios(projectId)
    const emittedEvents = await getPostgres()
      .db.select()
      .from(outboxEvents)
      .where(inArray(outboxEvents.aggregateId, [projectId, investigation.id]))

    expect(graph.workItems).toHaveLength(2)
    expect(graph.scopeGroups).toHaveLength(1)
    expect(graph.dependencies).toHaveLength(1)
    expect(savedScenarios).toHaveLength(1)
    expect(emittedEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['dependency.created', 'investigation.created']),
    )
    expect(investigation.parsedIntent).toEqual({
      kind: 'deadline_probability',
    })
  })

  it('enforces progress constraints in Postgres', async () => {
    await expect(
      getPostgres().db.insert(workItems).values({
        projectId,
        kind: 'task',
        title: 'Invalid progress',
        size: 's',
        progressPercent: 101,
      }),
    ).rejects.toThrow()
  })

  it('rejects a cycle before persistence', async () => {
    await expect(
      createDependency({
        projectId,
        predecessorId: secondItemId,
        successorId: firstItemId,
      }),
    ).rejects.toBeInstanceOf(GraphCycleError)
  })
})
