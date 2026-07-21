import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const sql = postgres(databaseUrl, { max: 1 })

try {
  await sql.unsafe(`DROP TABLE IF EXISTS
    demo_data_provenance, outbox_events, investigations, scenarios, dependencies, work_items,
    scope_groups, projects, buildgraph_schema_migrations CASCADE`)
  await sql.unsafe(
    'DROP TYPE IF EXISTS investigation_status, dependency_type, work_item_size, work_item_status, work_item_kind, scope_classification CASCADE',
  )
  console.log('Reset Postgres schema')
} finally {
  await sql.end()
}
