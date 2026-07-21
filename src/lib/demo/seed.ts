import 'server-only'

import type { ClickHouseClient } from '@clickhouse/client'
import { z } from 'zod'

import {
  getClickHouse,
  getPostgres,
  type PostgresConnection,
} from '@/lib/clients'
import {
  findExistingCiRunIds,
  findExistingProjectionEventIds,
  insertCiRunEvents,
  insertDeliveryEvents,
} from '@/lib/clickhouse/storage'
import { atlasProvenanceManifest, buildAtlasFixture } from '@/lib/demo/atlas'
import {
  DEMO_GENERATOR_VERSION,
  DEMO_HISTORY_DEFAULTS,
  DEMO_NOTICE,
  DEMO_RECORDED_AT,
  DEMO_SEED,
  DEMO_UUID_NAMESPACE,
} from '@/lib/demo/constants'
import {
  type DemoHistoryConfig,
  generateCiRunChunks,
  generateDeliveryEventChunks,
  historicalProjects,
  historyManifest,
} from '@/lib/demo/history'
import { deterministicDemoUuid } from '@/lib/demo/uuid'
import { loadProjectGraph, readScenarios } from '@/lib/postgres/repositories'
import {
  demoDataProvenance,
  dependencies,
  projects,
  scenarios,
  scopeGroups,
  workItems,
} from '@/lib/postgres/schema'

export class DemoSeedConsistencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DemoSeedConsistencyError'
  }
}

function projectValue(
  project:
    | ReturnType<typeof historicalProjects>[number]
    | ReturnType<typeof buildAtlasFixture>['project'],
) {
  return {
    ...project,
    forecastAnchorAt: new Date(project.forecastAnchorAt),
    createdAt: new Date(project.createdAt),
    updatedAt: new Date(project.updatedAt),
  }
}

export async function seedOperationalDemoData(
  override: PostgresConnection = getPostgres(),
  config: DemoHistoryConfig = DEMO_HISTORY_DEFAULTS,
) {
  const atlas = buildAtlasFixture()
  const history = historicalProjects(config.projectCount)
  await override.transaction(async (tx) => {
    for (const project of [atlas.project, ...history]) {
      const value = projectValue(project)
      await tx
        .insert(projects)
        .values(value)
        .onConflictDoUpdate({
          target: projects.id,
          set: {
            slug: value.slug,
            name: value.name,
            description: value.description,
            timezone: value.timezone,
            targetDate: value.targetDate,
            forecastAnchorAt: value.forecastAnchorAt,
            workingDayStart: value.workingDayStart,
            workingDayEnd: value.workingDayEnd,
            enabledWeekdays: value.enabledWeekdays,
            updatedAt: value.updatedAt,
          },
        })
    }
    for (const group of atlas.scopeGroups) {
      await tx
        .insert(scopeGroups)
        .values(group)
        .onConflictDoUpdate({
          target: scopeGroups.id,
          set: {
            slug: group.slug,
            name: group.name,
            description: group.description,
            classification: group.classification,
            displayOrder: group.displayOrder,
          },
        })
    }
    for (const item of atlas.workItems) {
      const value = {
        ...item,
        startedAt: item.startedAt ? new Date(item.startedAt) : null,
        completedAt: item.completedAt ? new Date(item.completedAt) : null,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }
      await tx
        .insert(workItems)
        .values(value)
        .onConflictDoUpdate({
          target: workItems.id,
          set: {
            scopeGroupId: value.scopeGroupId,
            kind: value.kind,
            status: value.status,
            title: value.title,
            description: value.description,
            size: value.size,
            progressPercent: value.progressPercent,
            sourceUrl: value.sourceUrl,
            sourceReference: value.sourceReference,
            graphX: value.graphX,
            graphY: value.graphY,
            startedAt: value.startedAt,
            completedAt: value.completedAt,
            updatedAt: value.updatedAt,
          },
        })
    }
    for (const edge of atlas.dependencies) {
      await tx
        .insert(dependencies)
        .values({
          ...edge,
          createdAt: new Date(edge.createdAt),
        })
        .onConflictDoNothing()
    }
    for (const scenario of atlas.scenarios) {
      const value = { ...scenario, createdAt: new Date(scenario.createdAt) }
      await tx
        .insert(scenarios)
        .values(value)
        .onConflictDoUpdate({
          target: scenarios.id,
          set: {
            slug: value.slug,
            name: value.name,
            description: value.description,
            excludedScopeGroupIds: value.excludedScopeGroupIds,
            resolvedBlockerIds: value.resolvedBlockerIds,
          },
        })
    }
    const manifest = {
      ...atlasProvenanceManifest(config),
      history: historyManifest(config),
    }
    await tx
      .insert(demoDataProvenance)
      .values({
        id: deterministicDemoUuid('provenance:atlas-v1'),
        datasetSlug: 'atlas',
        seed: DEMO_SEED,
        namespaceUuid: DEMO_UUID_NAMESPACE,
        generatorVersion: DEMO_GENERATOR_VERSION,
        fictional: 1,
        notice: DEMO_NOTICE,
        manifest,
        recordedAt: new Date(DEMO_RECORDED_AT),
      })
      .onConflictDoUpdate({
        target: demoDataProvenance.id,
        set: { manifest, notice: DEMO_NOTICE },
      })
  })
  return {
    projects: config.projectCount + 1,
    scopeGroups: atlas.scopeGroups.length,
    workItems: atlas.workItems.length,
    dependencies: atlas.dependencies.length,
    scenarios: atlas.scenarios.length,
  }
}

export async function ingestDemoHistory(
  config: DemoHistoryConfig = DEMO_HISTORY_DEFAULTS,
  client: ClickHouseClient = getClickHouse(),
) {
  let deliveryInserted = 0
  let deliverySkipped = 0
  let ciInserted = 0
  let ciSkipped = 0
  let deliveryChunks = 0
  let ciChunks = 0

  for (const chunk of generateDeliveryEventChunks(config)) {
    const ids = chunk.rows.map((row) => row.event_id)
    const existing = await findExistingProjectionEventIds(
      'delivery_events',
      ids,
      client,
    )
    if (existing.size !== 0 && existing.size !== ids.length) {
      throw new DemoSeedConsistencyError(
        `Delivery chunk ${chunk.index} is only partially present`,
      )
    }
    if (existing.size === ids.length) {
      deliverySkipped += ids.length
    } else {
      await insertDeliveryEvents(chunk.rows, {
        client,
        chunkSize: config.chunkSize,
        deduplicationToken: chunk.token,
      })
      deliveryInserted += ids.length
    }
    deliveryChunks++
  }

  for (const chunk of generateCiRunChunks(config)) {
    const ids = chunk.rows.map((row) => row.run_id)
    const existing = await findExistingCiRunIds(ids, client)
    if (existing.size !== 0 && existing.size !== ids.length) {
      throw new DemoSeedConsistencyError(
        `CI chunk ${chunk.index} is only partially present`,
      )
    }
    if (existing.size === ids.length) {
      ciSkipped += ids.length
    } else {
      await insertCiRunEvents(chunk.rows, {
        client,
        chunkSize: config.chunkSize,
        deduplicationToken: chunk.token,
      })
      ciInserted += ids.length
    }
    ciChunks++
  }
  return {
    deliveryInserted,
    deliverySkipped,
    ciInserted,
    ciSkipped,
    deliveryChunks,
    ciChunks,
  }
}

async function queryCount(
  client: ClickHouseClient,
  query: string,
  queryParams: Record<string, unknown> = {},
) {
  const result = await client.query({
    query,
    query_params: queryParams,
    format: 'JSONEachRow',
  })
  const rows = z
    .array(z.object({ value: z.coerce.number().int().nonnegative() }))
    .parse(await result.json())
  return rows[0]?.value ?? 0
}

export async function verifyDemoSeed(
  config: DemoHistoryConfig = DEMO_HISTORY_DEFAULTS,
  override: PostgresConnection = getPostgres(),
  client: ClickHouseClient = getClickHouse(),
) {
  const atlas = buildAtlasFixture()
  const [graph, scenarioRows] = await Promise.all([
    loadProjectGraph(atlas.project.id, override),
    readScenarios(atlas.project.id, override),
  ])
  if (graph.workItems.length !== 42 || graph.dependencies.length !== 52) {
    throw new DemoSeedConsistencyError(
      'Atlas graph does not contain exactly 42 items and 52 dependencies',
    )
  }
  if (scenarioRows.length !== 3)
    throw new DemoSeedConsistencyError('Atlas scenarios are incomplete')

  const projectIds = historicalProjects(config.projectCount).map(
    (project) => project.id,
  )
  const params = { projectIds }
  const [delivery, ci, cycle, blocked, throughput, ciProjection] =
    await Promise.all([
      queryCount(
        client,
        'SELECT count() AS value FROM delivery_events WHERE project_id IN {projectIds:Array(UUID)}',
        params,
      ),
      queryCount(
        client,
        'SELECT count() AS value FROM ci_run_events WHERE project_id IN {projectIds:Array(UUID)}',
        params,
      ),
      queryCount(
        client,
        'SELECT count() AS value FROM cycle_time_aggregates WHERE project_id IN {projectIds:Array(UUID)}',
        params,
      ),
      queryCount(
        client,
        'SELECT count() AS value FROM blocked_duration_aggregates WHERE project_id IN {projectIds:Array(UUID)}',
        params,
      ),
      queryCount(
        client,
        'SELECT count() AS value FROM daily_throughput_aggregates WHERE project_id IN {projectIds:Array(UUID)}',
        params,
      ),
      queryCount(
        client,
        "SELECT count() AS value FROM ci_workflow_aggregates WHERE workflow IN ('unit', 'integration', 'browser', 'security')",
      ),
    ])
  if (delivery !== config.deliveryEventCount || ci !== config.ciRunCount) {
    throw new DemoSeedConsistencyError(
      `History count mismatch: delivery=${delivery}, ci=${ci}`,
    )
  }
  if ([cycle, blocked, throughput, ciProjection].some((count) => count === 0)) {
    throw new DemoSeedConsistencyError(
      'One or more analytical projections are empty',
    )
  }
  const baseline = atlas.calibration.baseline
  const deferred = atlas.calibration.deferAuditExport
  if (
    baseline.expected < baseline.range[0] ||
    baseline.expected > baseline.range[1]
  ) {
    throw new DemoSeedConsistencyError(
      'Baseline calibration knob is outside its contract',
    )
  }
  if (
    deferred.expected < deferred.range[0] ||
    deferred.expected > deferred.range[1]
  ) {
    throw new DemoSeedConsistencyError(
      'Deferred-scope calibration knob is outside its contract',
    )
  }
  return {
    atlasItems: graph.workItems.length,
    atlasDependencies: graph.dependencies.length,
    scenarios: scenarioRows.length,
    deliveryEvents: delivery,
    ciRuns: ci,
    projections: { cycle, blocked, throughput, ci: ciProjection },
    calibration: {
      baseline: baseline.expected,
      deferAuditExport: deferred.expected,
    },
  }
}
