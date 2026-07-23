import 'server-only'

import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { ConfigurationError, readOptionalRuntimeEnvironment } from '@/lib/env'
import { postgresSchema } from '@/lib/postgres/schema'

type PostgresJsDatabase = ReturnType<
  typeof drizzlePostgres<typeof postgresSchema>
>
type PostgresExecutor = Pick<
  PostgresJsDatabase,
  'delete' | 'execute' | 'insert' | 'select' | 'update'
>

export interface PostgresConnection {
  readonly db: PostgresExecutor
  transaction<T>(callback: (tx: PostgresExecutor) => Promise<T>): Promise<T>
  close(): Promise<void>
}

let postgresClient: PostgresConnection | undefined
let clickHouseClient: ClickHouseClient | undefined

export function getPostgres(): PostgresConnection {
  if (!postgresClient) {
    const { DATABASE_URL } = readOptionalRuntimeEnvironment()
    if (!DATABASE_URL) {
      throw new ConfigurationError(['DATABASE_URL'])
    }

    const client = postgres(DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    })
    const db = drizzlePostgres(client, { schema: postgresSchema })
    postgresClient = {
      db,
      transaction: (callback) => db.transaction(callback),
      close: () => client.end(),
    }
  }

  return postgresClient
}

export function getClickHouse(): ClickHouseClient {
  if (!clickHouseClient) {
    const environment = readOptionalRuntimeEnvironment()
    const required = [
      'CLICKHOUSE_HOST',
      'CLICKHOUSE_USERNAME',
      'CLICKHOUSE_PASSWORD',
      'CLICKHOUSE_DATABASE',
    ].filter((name) => !environment[name as keyof typeof environment])

    if (required.length > 0) {
      throw new ConfigurationError(required)
    }

    clickHouseClient = createClient({
      url: environment.CLICKHOUSE_HOST!,
      username: environment.CLICKHOUSE_USERNAME!,
      password: environment.CLICKHOUSE_PASSWORD!,
      database: environment.CLICKHOUSE_DATABASE!,
    })
  }

  return clickHouseClient
}

export const getPostgresClient = getPostgres
export const getClickHouseClient = getClickHouse

export async function resetDatabaseClientsForTests() {
  await Promise.all([postgresClient?.close(), clickHouseClient?.close()])
  postgresClient = undefined
  clickHouseClient = undefined
}
