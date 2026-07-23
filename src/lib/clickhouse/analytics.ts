import 'server-only'

import type { ClickHouseClient } from '@clickhouse/client'
import { z } from 'zod'

import { getClickHouse } from '@/lib/clients'

const uuid = z.uuid()
const itemKind = z.enum([
  'requirement',
  'task',
  'pull_request',
  'test',
  'milestone',
])
const itemSize = z.enum(['xs', 's', 'm', 'l', 'xl'])
const itemStatus = z.enum(['todo', 'in_progress', 'blocked', 'done'])

const cycleTimeRow = z.object({
  p25: z.number().nonnegative(),
  p50: z.number().nonnegative(),
  p90: z.number().nonnegative(),
  sample_count: z.coerce.number().int().nonnegative(),
})

export type FallbackLevel = 'exact' | 'cohort' | 'kind' | 'global'

async function firstRow<T>(
  client: ClickHouseClient,
  query: string,
  queryParams: Record<string, string>,
  schema: z.ZodType<T>,
) {
  const result = await client.query({
    query,
    query_params: queryParams,
    format: 'JSONEachRow',
  })
  return z.array(schema).parse(await result.json())[0]
}

export async function queryCycleTimeQuantiles(
  input: {
    projectId: string
    itemKind: z.input<typeof itemKind>
    size: z.input<typeof itemSize>
    startingStatus: z.input<typeof itemStatus>
  },
  client: ClickHouseClient = getClickHouse(),
) {
  const value = z
    .object({
      projectId: uuid,
      itemKind,
      size: itemSize,
      startingStatus: itemStatus,
    })
    .parse(input)
  const levels: Array<{
    level: FallbackLevel
    where: string
    params: Record<string, string>
  }> = [
    {
      level: 'exact',
      where:
        'project_id = {projectId:UUID} AND item_kind = {itemKind:String} AND size = {size:String} AND starting_status = {startingStatus:String}',
      params: value,
    },
    {
      level: 'cohort',
      where: "item_kind != 'milestone' AND size = {size:String}",
      params: { size: value.size },
    },
    {
      level: 'kind',
      where: 'project_id = {projectId:UUID} AND item_kind = {itemKind:String}',
      params: { projectId: value.projectId, itemKind: value.itemKind },
    },
    { level: 'global', where: '1 = 1', params: {} },
  ]

  for (const level of levels) {
    const row = await firstRow(
      client,
      `SELECT
         quantilesTDigestMerge(0.25, 0.5, 0.9)(duration_quantiles)[1] AS p25,
         quantilesTDigestMerge(0.25, 0.5, 0.9)(duration_quantiles)[2] AS p50,
         quantilesTDigestMerge(0.25, 0.5, 0.9)(duration_quantiles)[3] AS p90,
         countMerge(sample_count) AS sample_count
       FROM cycle_time_aggregates WHERE ${level.where}
       HAVING sample_count > 0`,
      level.params,
      cycleTimeRow,
    )
    if (row) return { ...row, fallbackLevel: level.level }
  }
  return undefined
}

export async function queryBlockedDurationQuantiles(
  projectId: string,
  kind: z.input<typeof itemKind>,
  client: ClickHouseClient = getClickHouse(),
) {
  const params = {
    projectId: uuid.parse(projectId),
    itemKind: itemKind.parse(kind),
  }
  const row = await firstRow(
    client,
    `SELECT
       quantilesTDigestMerge(0.25, 0.5, 0.9)(duration_quantiles)[1] AS p25,
       quantilesTDigestMerge(0.25, 0.5, 0.9)(duration_quantiles)[2] AS p50,
       quantilesTDigestMerge(0.25, 0.5, 0.9)(duration_quantiles)[3] AS p90,
       countMerge(sample_count) AS sample_count
     FROM blocked_duration_aggregates
     WHERE project_id = {projectId:UUID} AND item_kind = {itemKind:String}
     HAVING sample_count > 0`,
    params,
    cycleTimeRow,
  )
  return row ? { ...row, fallbackLevel: 'exact' as const } : undefined
}

const ciRow = z.object({
  workflow: z.string(),
  success_rate: z.number().min(0).max(1),
  retry_rate: z.number().min(0).max(1),
  p50_duration_seconds: z.number().nonnegative(),
  p90_duration_seconds: z.number().nonnegative(),
  run_count: z.coerce.number().int().nonnegative(),
})

export async function queryCiWorkflowMetrics(
  workflow: string,
  client: ClickHouseClient = getClickHouse(),
) {
  return firstRow(
    client,
    `SELECT workflow, avgMerge(success_rate) AS success_rate,
       avgMerge(retry_rate) AS retry_rate,
       quantilesTDigestMerge(0.5, 0.9)(duration_quantiles)[1] AS p50_duration_seconds,
       quantilesTDigestMerge(0.5, 0.9)(duration_quantiles)[2] AS p90_duration_seconds,
       countMerge(run_count) AS run_count
     FROM ci_workflow_aggregates
     WHERE workflow = {workflow:String}
     GROUP BY workflow`,
    { workflow: z.string().min(1).parse(workflow) },
    ciRow,
  )
}

const throughputRow = z.object({
  day: z.iso.date(),
  item_kind: itemKind,
  completed_count: z.coerce.number().int().nonnegative(),
})

export async function queryDailyThroughput(
  projectId: string,
  from: string,
  to: string,
  client: ClickHouseClient = getClickHouse(),
) {
  const result = await client.query({
    query: `SELECT day, item_kind, sum(completed_count) AS completed_count
      FROM daily_throughput_aggregates
      WHERE project_id = {projectId:UUID}
        AND day BETWEEN {from:Date} AND {to:Date}
      GROUP BY day, item_kind ORDER BY day, item_kind`,
    query_params: {
      projectId: uuid.parse(projectId),
      from: z.iso.date().parse(from),
      to: z.iso.date().parse(to),
    },
    format: 'JSONEachRow',
  })
  return z.array(throughputRow).parse(await result.json())
}
