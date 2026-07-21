import { describe, expect, it, vi } from 'vitest'

import {
  ForecastStartError,
  chatOutcomeResponse,
  createQuestionInvestigation,
  createScenarioInvestigation,
  retryInvestigation,
  type InvestigationServiceDependencies,
} from '@/lib/ai/investigation-service'
import { buildAtlasFixture } from '@/lib/demo/atlas'
import { deterministicDemoUuid } from '@/lib/demo/uuid'

const atlas = buildAtlasFixture()
const investigationId = deterministicDemoUuid('service:investigation')
const retryKey = deterministicDemoUuid('service:retry')
const scenario = atlas.scenarios.find(
  (candidate) => candidate.slug === 'defer-audit-export',
)!

function fakeDependencies() {
  const investigation = {
    id: investigationId,
    projectId: atlas.project.id,
    originalQuestion: 'Can Atlas ship by Friday?',
    parsedIntent: {
      kind: 'deadline_probability' as const,
      targetDate: '2026-07-24',
    },
    targetDate: '2026-07-24',
    selectedScenarioIds: [] as string[],
    status: 'queued' as const,
    triggerRunId: null,
    randomSeed: 12345,
    finalResult: null,
    failureCode: null,
    failureDetail: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    updatedAt: new Date(),
  }
  const create = vi.fn(async (input: Record<string, unknown>) => ({
    ...investigation,
    ...input,
  }))
  const get = vi.fn(async () => investigation)
  const update = vi.fn(async () => investigation)
  const start = vi.fn(async () => ({
    runId: 'run_123',
    publicAccessToken: 'public_run_token',
  }))
  const classify = vi.fn<InvestigationServiceDependencies['classify']>(
    async () => ({
      supported: true,
      intent: {
        kind: 'deadline_probability',
        targetDate: '2026-07-24',
      },
      targetDate: '2026-07-24',
    }),
  )
  const deps = {
    create,
    get,
    update,
    start,
    classify,
    loadGraph: vi.fn(async () => ({
      project: {
        ...atlas.project,
        forecastAnchorAt: new Date(atlas.project.forecastAnchorAt),
        createdAt: new Date(atlas.project.createdAt),
        updatedAt: new Date(atlas.project.updatedAt),
      },
      scopeGroups: atlas.scopeGroups.map((group) => ({
        ...group,
        createdAt: new Date(atlas.project.createdAt),
      })),
      workItems: atlas.workItems,
      dependencies: atlas.dependencies,
    })),
    loadScenarios: vi.fn(async () => atlas.scenarios),
    uuid: vi
      .fn<() => string>()
      .mockReturnValueOnce(investigationId)
      .mockReturnValue(retryKey),
  } as unknown as InvestigationServiceDependencies
  return { deps, investigation, create, get, update, start, classify }
}

describe('investigation application service', () => {
  it('creates and starts an approved investigation with no backend secret', async () => {
    const { deps, create, start } = fakeDependencies()
    const result = await createQuestionInvestigation(
      'Can Atlas ship by Friday?',
      deps,
      { gatewayApiKey: 'user-owned-gateway-key-for-tests' },
    )
    expect(result).toEqual({
      kind: 'started',
      investigationId,
      runId: 'run_123',
      publicAccessToken: 'public_run_token',
    })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: investigationId,
        projectId: atlas.project.id,
        targetDate: '2026-07-24',
      }),
    )
    expect(start).toHaveBeenCalledWith(
      investigationId,
      expect.objectContaining({ runKey: 'initial' }),
    )
  })

  it('returns suggestions without creating an investigation or run', async () => {
    const { deps, create, start, classify } = fakeDependencies()
    classify.mockResolvedValueOnce({ supported: false })
    await expect(
      createQuestionInvestigation('Write a poem about my manager.', deps, {
        gatewayApiKey: 'user-owned-gateway-key-for-tests',
      }),
    ).resolves.toEqual({ kind: 'unsupported' })
    expect(create).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('marks a trigger failure safely and exposes no provider detail', async () => {
    const { deps, start, update } = fakeDependencies()
    start.mockRejectedValueOnce(
      new Error('TRIGGER_SECRET_KEY=private and internal stack'),
    )
    await expect(
      createQuestionInvestigation('Can Atlas ship by Friday?', deps, {
        gatewayApiKey: 'user-owned-gateway-key-for-tests',
      }),
    ).rejects.toBeInstanceOf(ForecastStartError)
    expect(update).toHaveBeenCalledWith(
      investigationId,
      expect.objectContaining({
        status: 'failed',
        failureCode: 'forecast_unavailable',
        failureDetail: 'The forecast could not be started. Please retry.',
      }),
    )
  })

  it('retries with a fresh run key while preserving intent and seed', async () => {
    const { deps, investigation, update, start } = fakeDependencies()
    const result = await retryInvestigation(investigationId, deps)
    expect(result.parsedIntent).toEqual(investigation.parsedIntent)
    expect(result.randomSeed).toBe(investigation.randomSeed)
    expect(start).toHaveBeenCalledWith(
      investigationId,
      expect.objectContaining({ runKey: `retry:${investigationId}` }),
    )
    expect(update).toHaveBeenCalledWith(
      investigationId,
      expect.objectContaining({ status: 'queued', triggerRunId: 'run_123' }),
    )
  })

  it('starts a saved scenario without another model call', async () => {
    const { deps, classify, create } = fakeDependencies()
    await createScenarioInvestigation(scenario.id, {}, deps)
    expect(classify).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedScenarioIds: [scenario.id],
        parsedIntent: expect.objectContaining({ kind: 'compare_scenarios' }),
      }),
    )
  })

  it('emits ordered AI SDK text and persistent investigation chunks', async () => {
    const response = chatOutcomeResponse({
      kind: 'started',
      investigationId,
      runId: 'run_123',
      publicAccessToken: 'public_run_token',
    })
    const serialized = await response.text()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(serialized.indexOf('text-start')).toBeLessThan(
      serialized.indexOf('text-delta'),
    )
    expect(serialized.indexOf('text-delta')).toBeLessThan(
      serialized.indexOf('text-end'),
    )
    expect(serialized.indexOf('text-end')).toBeLessThan(
      serialized.indexOf('data-investigation'),
    )
    expect(serialized).toContain('public_run_token')
    expect(serialized).not.toMatch(
      /DATABASE_URL|CLICKHOUSE_PASSWORD|TRIGGER_SECRET_KEY|postgres:\/\//,
    )
  })

  it('emits exactly three actionable unsupported suggestions', async () => {
    const serialized = await chatOutcomeResponse({ kind: 'unsupported' }).text()
    expect(serialized).toContain('data-unsupported')
    expect(
      serialized.match(/Can Atlas|What is blocking|What scope change/g),
    ).toHaveLength(3)
    expect(serialized).not.toContain('data-investigation')
  })
})
