import { sql } from 'drizzle-orm'

import { getClickHouse, getPostgres } from '@/lib/clients'
import { checkClickHouseHealth } from '@/lib/clickhouse/storage'
import {
  readOptionalRuntimeEnvironment,
  type OptionalRuntimeEnvironment,
} from '@/lib/env'

export const APPLICATION_VERSION = '0.1.0'

export type Reachability =
  'not_configured' | 'unknown' | 'reachable' | 'unreachable'

export interface DependencyProbe {
  postgres: Reachability
  clickhouse: Reachability
  trigger: Reachability
}

export interface HealthResponse {
  application: {
    name: 'build-graph'
    version: string
    status: 'ok' | 'degraded'
  }
  dependencies: {
    postgres: { configured: boolean; reachability: Reachability }
    clickhouse: { configured: boolean; reachability: Reachability }
    trigger: { configured: boolean; reachability: Reachability }
  }
}

function isClickHouseConfigured(
  environment: OptionalRuntimeEnvironment,
): boolean {
  return Boolean(
    environment.CLICKHOUSE_HOST &&
    environment.CLICKHOUSE_USERNAME &&
    environment.CLICKHOUSE_PASSWORD &&
    environment.CLICKHOUSE_DATABASE,
  )
}

function isTriggerConfigured(environment: OptionalRuntimeEnvironment): boolean {
  return Boolean(
    environment.TRIGGER_SECRET_KEY && environment.TRIGGER_PROJECT_REF,
  )
}

export function createHealthResponse(
  environment: OptionalRuntimeEnvironment,
  probe: DependencyProbe,
): HealthResponse {
  const dependencies: HealthResponse['dependencies'] = {
    postgres: {
      configured: Boolean(environment.DATABASE_URL),
      reachability: probe.postgres,
    },
    clickhouse: {
      configured: isClickHouseConfigured(environment),
      reachability: probe.clickhouse,
    },
    trigger: {
      configured: isTriggerConfigured(environment),
      reachability: probe.trigger,
    },
  }
  const degraded = Object.values(dependencies).some(
    ({ reachability }) => reachability === 'unreachable',
  )

  return {
    application: {
      name: 'build-graph',
      version: APPLICATION_VERSION,
      status: degraded ? 'degraded' : 'ok',
    },
    dependencies,
  }
}

async function probePostgres(configured: boolean): Promise<Reachability> {
  if (!configured) return 'not_configured'

  try {
    await getPostgres().db.execute(sql`select 1`)
    return 'reachable'
  } catch {
    return 'unreachable'
  }
}

async function probeClickHouse(configured: boolean): Promise<Reachability> {
  if (!configured) return 'not_configured'

  try {
    return (await checkClickHouseHealth(getClickHouse()))
      ? 'reachable'
      : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

export async function getPublicHealthResponse(
  source: Record<string, string | undefined> = process.env,
): Promise<HealthResponse> {
  const environment = readOptionalRuntimeEnvironment(source)
  const postgresConfigured = Boolean(environment.DATABASE_URL)
  const clickHouseConfigured = isClickHouseConfigured(environment)
  const triggerConfigured = isTriggerConfigured(environment)
  const [postgres, clickhouse] = await Promise.all([
    probePostgres(postgresConfigured),
    probeClickHouse(clickHouseConfigured),
  ])

  return createHealthResponse(environment, {
    postgres,
    clickhouse,
    trigger: triggerConfigured ? 'unknown' : 'not_configured',
  })
}
