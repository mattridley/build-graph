import { inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { getClickHouse, getPostgres } from '@/lib/clients'
import { buildAtlasFixture } from '@/lib/demo/atlas'
import {
  historicalProjects,
  SMALL_DEMO_HISTORY_CONFIG,
} from '@/lib/demo/history'
import {
  ingestDemoHistory,
  seedOperationalDemoData,
  verifyDemoSeed,
} from '@/lib/demo/seed'
import { demoDataProvenance, projects } from '@/lib/postgres/schema'

const run =
  process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

run('deterministic Atlas demo seed', () => {
  const projectIds = [
    buildAtlasFixture().project.id,
    ...historicalProjects(SMALL_DEMO_HISTORY_CONFIG.projectCount).map(
      (project) => project.id,
    ),
  ]

  async function cleanup() {
    const clickhouse = getClickHouse()
    for (const table of ['delivery_events', 'ci_run_events']) {
      await clickhouse.command({
        query: `ALTER TABLE ${table} DELETE WHERE project_id IN {projectIds:Array(UUID)}`,
        query_params: { projectIds },
        clickhouse_settings: { mutations_sync: '2' },
      })
    }
    for (const table of [
      'cycle_time_aggregates',
      'blocked_duration_aggregates',
      'daily_throughput_aggregates',
    ]) {
      await clickhouse.command({
        query: `ALTER TABLE ${table} DELETE WHERE project_id IN {projectIds:Array(UUID)}`,
        query_params: { projectIds },
        clickhouse_settings: { mutations_sync: '2' },
      })
    }
    await clickhouse.command({
      query:
        "ALTER TABLE ci_workflow_aggregates DELETE WHERE workflow IN ('unit', 'integration', 'browser', 'security')",
      clickhouse_settings: { mutations_sync: '2' },
    })
    const postgres = getPostgres().db
    await postgres.delete(projects).where(inArray(projects.id, projectIds))
    await postgres.delete(demoDataProvenance)
  }

  it('is idempotent across operational records, source events, and projections', async () => {
    await cleanup()
    try {
      await seedOperationalDemoData(getPostgres(), SMALL_DEMO_HISTORY_CONFIG)
      await seedOperationalDemoData(getPostgres(), SMALL_DEMO_HISTORY_CONFIG)
      const first = await ingestDemoHistory(SMALL_DEMO_HISTORY_CONFIG)
      const second = await ingestDemoHistory(SMALL_DEMO_HISTORY_CONFIG)
      expect(first.deliveryInserted).toBe(
        SMALL_DEMO_HISTORY_CONFIG.deliveryEventCount,
      )
      expect(first.ciInserted).toBe(SMALL_DEMO_HISTORY_CONFIG.ciRunCount)
      expect(second.deliveryInserted).toBe(0)
      expect(second.deliverySkipped).toBe(
        SMALL_DEMO_HISTORY_CONFIG.deliveryEventCount,
      )
      expect(second.ciInserted).toBe(0)
      expect(second.ciSkipped).toBe(SMALL_DEMO_HISTORY_CONFIG.ciRunCount)
      await expect(
        verifyDemoSeed(SMALL_DEMO_HISTORY_CONFIG),
      ).resolves.toMatchObject({
        atlasItems: 42,
        atlasDependencies: 52,
        scenarios: 3,
        deliveryEvents: SMALL_DEMO_HISTORY_CONFIG.deliveryEventCount,
        ciRuns: SMALL_DEMO_HISTORY_CONFIG.ciRunCount,
      })
    } finally {
      await cleanup()
    }
  })
})
