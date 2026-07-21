import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createClient } from '@clickhouse/client'

const required = [
  'CLICKHOUSE_HOST',
  'CLICKHOUSE_USERNAME',
  'CLICKHOUSE_PASSWORD',
  'CLICKHOUSE_DATABASE',
]
const missing = required.filter((name) => !process.env[name])
if (missing.length)
  throw new Error(`Missing configuration: ${missing.join(', ')}`)

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USERNAME,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
})
const directory = resolve('migrations/clickhouse')

try {
  await client.command({
    query: `CREATE TABLE IF NOT EXISTS buildgraph_schema_migrations (
      name String,
      applied_at DateTime64(3, 'UTC') DEFAULT now64(3)
    ) ENGINE = ReplacingMergeTree(applied_at) ORDER BY name`,
  })
  const result = await client.query({
    query: 'SELECT name FROM buildgraph_schema_migrations FINAL',
    format: 'JSONEachRow',
  })
  const applied = new Set((await result.json()).map((row) => row.name))
  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const source = await readFile(resolve(directory, file), 'utf8')
    const statements = source
      .split('-- statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)
    for (const statement of statements) {
      await client.command({ query: statement })
    }
    await client.insert({
      table: 'buildgraph_schema_migrations',
      values: [{ name: file }],
      format: 'JSONEachRow',
    })
    console.log(`Applied ClickHouse migration ${file}`)
  }
} finally {
  await client.close()
}
