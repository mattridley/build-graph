import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const sql = postgres(databaseUrl, { max: 1 })
const directory = resolve('migrations/postgres')

try {
  await sql`CREATE TABLE IF NOT EXISTS buildgraph_schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`
  const applied = new Set(
    (await sql`SELECT name FROM buildgraph_schema_migrations`).map(
      (row) => row.name,
    ),
  )
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

    await sql.begin(async (transaction) => {
      for (const statement of statements) await transaction.unsafe(statement)
      await transaction`INSERT INTO buildgraph_schema_migrations (name) VALUES (${file})`
    })
    console.log(`Applied Postgres migration ${file}`)
  }
} finally {
  await sql.end()
}
