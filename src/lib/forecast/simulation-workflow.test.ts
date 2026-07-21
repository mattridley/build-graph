import { describe, expect, it, vi } from 'vitest'

import {
  ForecastShardConsistencyError,
  runSimulationShard,
  type SimulationShardDependencies,
} from '@/lib/forecast/simulation-workflow'
import {
  workflowEngineInput,
  workflowScenario,
} from '@/lib/forecast/workflow-test-fixture'

function payload() {
  const input = workflowEngineInput()
  return {
    input,
    scenario: workflowScenario,
    shardIndex: 0,
    firstSample: 0,
    sampleCount: 250,
    baseSeed: input.seed,
  }
}

describe('simulation shard workflow', () => {
  it('persists 250 deterministic samples and returns only a compact checksum', async () => {
    const sampleNumbers = new Set<number>()
    const insertImpacts = vi.fn().mockResolvedValue(undefined)
    const insertSamples = vi.fn(
      async (rows: Array<{ sample_number: number }>) => {
        for (const row of rows) sampleNumbers.add(row.sample_number)
      },
    )
    const dependencies: SimulationShardDependencies = {
      findExistingSampleNumbers: async () => new Set(sampleNumbers),
      insertImpacts,
      insertSamples,
    }
    const first = await runSimulationShard(payload(), dependencies)
    const second = await runSimulationShard(payload(), dependencies)
    expect(first).toMatchObject({ sampleCount: 250, inserted: 250 })
    expect(first.checksum).toHaveLength(64)
    expect(second).toMatchObject({ sampleCount: 250, inserted: 0 })
    expect(second.checksum).toBe(first.checksum)
    expect(sampleNumbers.size).toBe(250)
    expect(insertImpacts).toHaveBeenCalledTimes(1)
    expect(insertSamples).toHaveBeenCalledTimes(1)
  })

  it('rejects partial durability and never marks a failed impact write complete', async () => {
    const partial: SimulationShardDependencies = {
      findExistingSampleNumbers: async () => new Set([0]),
      insertImpacts: vi.fn(),
      insertSamples: vi.fn(),
    }
    await expect(runSimulationShard(payload(), partial)).rejects.toBeInstanceOf(
      ForecastShardConsistencyError,
    )

    const insertSamples = vi.fn()
    const failed: SimulationShardDependencies = {
      findExistingSampleNumbers: async () => new Set(),
      insertImpacts: async () => {
        throw new Error('temporary clickhouse failure')
      },
      insertSamples,
    }
    await expect(runSimulationShard(payload(), failed)).rejects.toThrow(
      'temporary clickhouse failure',
    )
    expect(insertSamples).not.toHaveBeenCalled()
  })
})
