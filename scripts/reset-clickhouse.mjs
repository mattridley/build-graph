import { createClient } from '@clickhouse/client'

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USERNAME,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
})
const tables = [
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
