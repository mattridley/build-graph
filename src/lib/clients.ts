import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

import { ConfigurationError, readOptionalRuntimeEnvironment } from '@/lib/env'

let postgresClient: NeonQueryFunction<false, false> | undefined
let clickHouseClient: ClickHouseClient | undefined

export function getPostgresClient(): NeonQueryFunction<false, false> {
  if (!postgresClient) {
    const { DATABASE_URL } = readOptionalRuntimeEnvironment()
    if (!DATABASE_URL) {
      throw new ConfigurationError(['DATABASE_URL'])
    }
    postgresClient = neon(DATABASE_URL)
  }

  return postgresClient
}

export function getClickHouseClient(): ClickHouseClient {
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
