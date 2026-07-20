import { describe, expect, it } from 'vitest'

import {
  ConfigurationError,
  readOptionalRuntimeEnvironment,
  requireRuntimeEnvironment,
} from '@/lib/env'

const completeEnvironment = {
  DATABASE_URL: 'postgresql://example.invalid/buildgraph',
  CLICKHOUSE_HOST: 'https://example.invalid',
  CLICKHOUSE_USERNAME: 'buildgraph',
  CLICKHOUSE_PASSWORD: 'not-a-real-password',
  CLICKHOUSE_DATABASE: 'buildgraph',
  TRIGGER_SECRET_KEY: 'tr_dev_example',
  TRIGGER_PROJECT_REF: 'proj_example',
}

describe('environment parsing', () => {
  it('allows absent runtime configuration during a build', () => {
    expect(readOptionalRuntimeEnvironment({})).toEqual({})
  })

  it('applies the default model to complete runtime configuration', () => {
    expect(requireRuntimeEnvironment(completeEnvironment).AI_MODEL).toBe(
      'openai/gpt-5.4',
    )
  })

  it('reports each missing runtime variable without exposing values', () => {
    expect.assertions(2)
    try {
      requireRuntimeEnvironment({ DATABASE_URL: ' ' })
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError)
      expect((error as ConfigurationError).missingVariables).toContain(
        'DATABASE_URL',
      )
    }
  })
})
