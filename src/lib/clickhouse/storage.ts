import 'server-only'

import type { ClickHouseClient, ClickHouseSettings } from '@clickhouse/client'
import { z } from 'zod'

import { getClickHouse } from '@/lib/clients'

const uuid = z.uuid()
const dateTime = z.iso.datetime({ offset: true })
const properties = z.record(z.string(), z.unknown()).default({})

export const deliveryEventSchema = z.object({
  event_id: uuid,
  project_id: uuid,
  item_id: uuid,
  event_kind: z.string().min(1),
  item_kind: z
    .enum(['requirement', 'task', 'pull_request', 'test', 'milestone'])
    .nullable()
    .default(null),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).nullable(),
  starting_status: z
    .enum(['todo', 'in_progress', 'blocked', 'done'])
    .nullable()
    .default(null),
  size: z.enum(['xs', 's', 'm', 'l', 'xl']).nullable(),
  progress_percent: z.number().int().min(0).max(100).nullable(),
  duration_hours: z.number().nonnegative().nullable(),
  source: z.string().min(1),
  actor: z.string().nullable(),
  properties,
  occurred_at: dateTime,
})

export const ciRunEventSchema = z.object({
  run_id: z.string().min(1),
  workflow: z.string().min(1),
  conclusion: z.string().min(1),
  duration_seconds: z.number().int().nonnegative(),
  retry_count: z.number().int().nonnegative(),
  project_id: uuid.nullable(),
  item_id: uuid.nullable(),
  properties,
  started_at: dateTime,
  completed_at: dateTime,
})

export const forecastSampleSchema = z.object({
  project_id: uuid,
  investigation_id: uuid,
  scenario_id: uuid,
  sample_number: z.number().int().nonnegative(),
  completion_at: dateTime,
  sampled_critical_path: z.array(uuid),
})

export const forecastItemImpactSchema = z.object({
  project_id: uuid,
  investigation_id: uuid,
  scenario_id: uuid,
  item_id: uuid,
  criticality_frequency: z.number().min(0).max(1),
  expected_delay_hours: z.number().nonnegative(),
  sample_count: z.number().int().nonnegative(),
})

export const forecastSummarySchema = z.object({
  project_id: uuid,
  investigation_id: uuid,
  scenario_id: uuid,
  on_time_probability: z.number().min(0).max(1),
  target_date: z.iso.date(),
  p50_completion_date: z.iso.date(),
  p80_completion_date: z.iso.date(),
  p95_completion_date: z.iso.date(),
  sample_count: z.number().int().nonnegative(),
})

export const investigationEventSchema = z.object({
  event_id: uuid,
  project_id: uuid,
  investigation_id: uuid,
  intent_kind: z.enum([
    'deadline_probability',
    'blocker_analysis',
    'scope_to_confidence',
    'compare_scenarios',
  ]),
  selected_scenario_ids: z.array(uuid),
  latency_ms: z.number().int().nonnegative(),
  outcome: z.string().min(1),
  properties,
  occurred_at: dateTime,
})

export interface BulkInsertOptions {
  chunkSize?: number
  deduplicationToken?: string
  client?: ClickHouseClient
}

async function insertRows<T>(
  table: string,
  schema: z.ZodType<T>,
  values: T[],
  options: BulkInsertOptions,
) {
  if (values.length === 0) return
  if (values.length > 10_000) {
    throw new RangeError('A single bulk insertion is limited to 10,000 rows')
  }
  const chunkSize = z
    .number()
    .int()
    .min(1)
    .max(2_000)
    .parse(options.chunkSize ?? 1_000)
  const parsed = z.array(schema).parse(values)
  const client = options.client ?? getClickHouse()

  for (let offset = 0; offset < parsed.length; offset += chunkSize) {
    const chunkNumber = offset / chunkSize
    const clickhouseSettings: ClickHouseSettings = {
      date_time_input_format: 'best_effort',
      insert_deduplicate: 1,
      deduplicate_blocks_in_dependent_materialized_views: 1,
      log_comment: options.deduplicationToken
        ? `buildgraph:${options.deduplicationToken}:${chunkNumber}`
        : 'buildgraph:bulk-insert',
      ...(options.deduplicationToken
        ? {
            insert_deduplication_token: `${options.deduplicationToken}:${chunkNumber}`,
          }
        : {}),
    }
    await client.insert({
      table,
      values: parsed.slice(offset, offset + chunkSize),
      format: 'JSONEachRow',
      clickhouse_settings: clickhouseSettings,
    })
  }
}

export const insertDeliveryEvents = (
  rows: z.input<typeof deliveryEventSchema>[],
  options: BulkInsertOptions = {},
) => insertRows('delivery_events', deliveryEventSchema, rows, options)

export const insertCiRunEvents = (
  rows: z.input<typeof ciRunEventSchema>[],
  options: BulkInsertOptions = {},
) => insertRows('ci_run_events', ciRunEventSchema, rows, options)

export const insertForecastSamples = (
  rows: z.input<typeof forecastSampleSchema>[],
  options: BulkInsertOptions = {},
) => insertRows('forecast_samples', forecastSampleSchema, rows, options)

export const insertForecastItemImpacts = (
  rows: z.input<typeof forecastItemImpactSchema>[],
  options: BulkInsertOptions = {},
) =>
  insertRows('forecast_item_impacts', forecastItemImpactSchema, rows, options)

export const insertForecastSummaries = (
  rows: z.input<typeof forecastSummarySchema>[],
  options: BulkInsertOptions = {},
) => insertRows('forecast_summaries', forecastSummarySchema, rows, options)

export const insertInvestigationEvents = (
  rows: z.input<typeof investigationEventSchema>[],
  options: BulkInsertOptions = {},
) => insertRows('investigation_events', investigationEventSchema, rows, options)

async function queryRows<T>(
  query: string,
  queryParams: Record<string, string | number>,
  schema: z.ZodType<T>,
  client: ClickHouseClient = getClickHouse(),
) {
  const result = await client.query({
    query,
    query_params: queryParams,
    format: 'JSONEachRow',
    clickhouse_settings: { date_time_output_format: 'iso' },
  })
  return z.array(schema).parse(await result.json())
}

export function queryDeliveryEvents(
  projectId: string,
  limit = 1_000,
  client?: ClickHouseClient,
) {
  return queryRows(
    `SELECT event_id, project_id, item_id, event_kind, item_kind, status,
      starting_status, size, progress_percent, duration_hours, source, actor,
      properties, occurred_at
     FROM delivery_events
     WHERE project_id = {projectId:UUID}
     ORDER BY occurred_at DESC LIMIT {limit:UInt32}`,
    { projectId: uuid.parse(projectId), limit },
    deliveryEventSchema,
    client,
  )
}

export async function findExistingProjectionEventIds(
  table: 'delivery_events' | 'investigation_events',
  eventIds: string[],
  client: ClickHouseClient = getClickHouse(),
) {
  if (eventIds.length === 0) return new Set<string>()
  const ids = z.array(uuid).max(10_000).parse(eventIds)
  const result = await client.query({
    query: `SELECT event_id FROM ${table} WHERE event_id IN {eventIds:Array(UUID)}`,
    query_params: { eventIds: ids },
    format: 'JSONEachRow',
  })
  const rows = z.array(z.object({ event_id: uuid })).parse(await result.json())
  return new Set(rows.map((row) => row.event_id))
}

export async function findExistingCiRunIds(
  runIds: string[],
  client: ClickHouseClient = getClickHouse(),
) {
  if (runIds.length === 0) return new Set<string>()
  const ids = z.array(z.string().min(1)).max(10_000).parse(runIds)
  const result = await client.query({
    query:
      'SELECT run_id FROM ci_run_events WHERE run_id IN {runIds:Array(String)}',
    query_params: { runIds: ids },
    format: 'JSONEachRow',
  })
  const rows = z
    .array(z.object({ run_id: z.string().min(1) }))
    .parse(await result.json())
  return new Set(rows.map((row) => row.run_id))
}

export function queryCiRunEvents(
  projectId: string,
  limit = 1_000,
  client?: ClickHouseClient,
) {
  return queryRows(
    `SELECT run_id, workflow, conclusion, duration_seconds, retry_count,
      project_id, item_id, properties, started_at, completed_at
     FROM ci_run_events
     WHERE project_id = {projectId:UUID}
     ORDER BY started_at DESC LIMIT {limit:UInt32}`,
    { projectId: uuid.parse(projectId), limit },
    ciRunEventSchema,
    client,
  )
}

export function queryForecastSamples(
  investigationId: string,
  scenarioId: string,
  client?: ClickHouseClient,
) {
  return queryRows(
    `SELECT project_id, investigation_id, scenario_id, sample_number,
      completion_at, sampled_critical_path
     FROM forecast_samples
     WHERE investigation_id = {investigationId:UUID}
       AND scenario_id = {scenarioId:UUID}
     ORDER BY sample_number`,
    {
      investigationId: uuid.parse(investigationId),
      scenarioId: uuid.parse(scenarioId),
    },
    forecastSampleSchema,
    client,
  )
}

export function queryForecastItemImpacts(
  investigationId: string,
  scenarioId: string,
  client?: ClickHouseClient,
) {
  return queryRows(
    `SELECT project_id, investigation_id, scenario_id, item_id,
      criticality_frequency, expected_delay_hours, sample_count
     FROM forecast_item_impacts
     WHERE investigation_id = {investigationId:UUID}
       AND scenario_id = {scenarioId:UUID}
     ORDER BY criticality_frequency DESC`,
    {
      investigationId: uuid.parse(investigationId),
      scenarioId: uuid.parse(scenarioId),
    },
    forecastItemImpactSchema,
    client,
  )
}

export function queryForecastSummaries(
  investigationId: string,
  client?: ClickHouseClient,
) {
  return queryRows(
    `SELECT project_id, investigation_id, scenario_id, on_time_probability,
      target_date, p50_completion_date, p80_completion_date,
      p95_completion_date, sample_count
     FROM forecast_summaries FINAL
     WHERE investigation_id = {investigationId:UUID}
     ORDER BY scenario_id`,
    { investigationId: uuid.parse(investigationId) },
    forecastSummarySchema,
    client,
  )
}

export function queryInvestigationEvents(
  investigationId: string,
  client?: ClickHouseClient,
) {
  return queryRows(
    `SELECT event_id, project_id, investigation_id, intent_kind,
      selected_scenario_ids, latency_ms, outcome, properties, occurred_at
     FROM investigation_events
     WHERE investigation_id = {investigationId:UUID}
     ORDER BY occurred_at`,
    { investigationId: uuid.parse(investigationId) },
    investigationEventSchema,
    client,
  )
}

export async function checkClickHouseHealth(
  client: ClickHouseClient = getClickHouse(),
) {
  try {
    return (await client.ping()).success
  } catch {
    return false
  }
}
