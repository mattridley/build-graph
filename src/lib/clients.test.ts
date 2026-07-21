import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getClickHouse,
  getPostgres,
  resetDatabaseClientsForTests,
} from '@/lib/clients'
import { ConfigurationError } from '@/lib/env'

describe('lazy database clients', () => {
  afterEach(async () => {
    await resetDatabaseClientsForTests()
    vi.unstubAllEnvs()
  })

  it('does not require database variables during module evaluation', () => {
    expect(typeof getPostgres).toBe('function')
    expect(typeof getClickHouse).toBe('function')
  })

  it('validates Postgres configuration only when requested', () => {
    vi.stubEnv('DATABASE_URL', '')
    expect(() => getPostgres()).toThrowError(ConfigurationError)
  })

  it('validates all ClickHouse settings only when requested', () => {
    vi.stubEnv('CLICKHOUSE_HOST', '')
    vi.stubEnv('CLICKHOUSE_USERNAME', '')
    vi.stubEnv('CLICKHOUSE_PASSWORD', '')
    vi.stubEnv('CLICKHOUSE_DATABASE', '')
    expect(() => getClickHouse()).toThrowError(ConfigurationError)
  })
})
