import { createClient } from '@clickhouse/client'

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USERNAME,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
})
const tables = [
  'daily_throughput_aggregates_mv',
  'ci_workflow_aggregates_mv',
  'blocked_duration_aggregates_mv',
  'cycle_time_aggregates_mv',
  'daily_throughput_aggregates',
  'ci_workflow_aggregates',
  'blocked_duration_aggregates',
  'cycle_time_aggregates',
  'investigation_events',
  'forecast_summaries',
  'forecast_item_impacts',
  'forecast_samples',
  'ci_run_events',
  'delivery_events',
  'buildgraph_schema_migrations',
]

try {
  for (const table of tables) {
    await client.command({ query: `DROP TABLE IF EXISTS ${table}` })
  }
  console.log('Reset ClickHouse schema')
} finally {
  await client.close()
}
