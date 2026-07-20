import { describe, expect, it } from 'vitest'

import { createHealthResponse } from '@/lib/health'

describe('public health response', () => {
  it('returns only safe configuration flags and reachability states', () => {
    const serialized = JSON.stringify(
      createHealthResponse(
        {
          DATABASE_URL: 'postgresql://user:secret@example.invalid/database',
          CLICKHOUSE_HOST: 'https://clickhouse.example.invalid',
          CLICKHOUSE_USERNAME: 'user',
          CLICKHOUSE_PASSWORD: 'secret',
          CLICKHOUSE_DATABASE: 'database',
          TRIGGER_SECRET_KEY: 'tr_secret',
          TRIGGER_PROJECT_REF: 'project',
        },
        {
          postgres: 'reachable',
          clickhouse: 'unreachable',
          trigger: 'unknown',
        },
      ),
    )

    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('example.invalid')
    expect(JSON.parse(serialized)).toMatchObject({
      application: { status: 'degraded', version: '0.1.0' },
      dependencies: {
        postgres: { configured: true, reachability: 'reachable' },
        clickhouse: { configured: true, reachability: 'unreachable' },
        trigger: { configured: true, reachability: 'unknown' },
      },
    })
  })
})
