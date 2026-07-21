import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { z } from 'zod'

import type { BuildGraphUIMessage } from '@/lib/ai/contracts'
import {
  type IntentClassification,
  type IntentGenerator,
  classifyInvestigationIntent,
} from '@/lib/ai/intent'
import { investigationIntentSchema } from '@/lib/contracts/forecast'
import { deterministicDemoUuid } from '@/lib/demo/uuid'
import { startForecastRelease } from '@/lib/forecast/realtime'
import {
  createInvestigation,
  getInvestigation,
  loadProjectGraph,
  readScenarios,
  updateInvestigation,
} from '@/lib/postgres/repositories'

export const DEMO_PROJECT_ID = deterministicDemoUuid('project:atlas')
export const unsupportedSuggestions = [
  'Can Atlas ship by Friday?',
  'What is blocking the Atlas release?',
  'What scope change gets Atlas to 80% confidence?',
] as const

type Investigation = Awaited<ReturnType<typeof getInvestigation>>

export interface InvestigationServiceDependencies {
  create: typeof createInvestigation
  get: typeof getInvestigation
  update: typeof updateInvestigation
  loadGraph: typeof loadProjectGraph
  loadScenarios: typeof readScenarios
  start: typeof startForecastRelease
  classify: (
    question: string,
    context: Parameters<typeof classifyInvestigationIntent>[1],
    gatewayApiKey: string,
    generator?: IntentGenerator,
  ) => Promise<IntentClassification>
  uuid: () => string
}

export const investigationServiceDependencies: InvestigationServiceDependencies =
  {
    create: createInvestigation,
    get: getInvestigation,
    update: updateInvestigation,
    loadGraph: loadProjectGraph,
    loadScenarios: readScenarios,
    start: startForecastRelease,
    classify: classifyInvestigationIntent,
    uuid: randomUUID,
  }

export class DemoBoundaryError extends Error {
  constructor() {
    super('The requested resource is outside the Atlas demo project.')
    this.name = 'DemoBoundaryError'
  }
}

export class MissingUserApiKeyError extends Error {
  constructor() {
    super('A user-supplied AI Gateway API key is required.')
    this.name = 'MissingUserApiKeyError'
  }
}

export class ForecastStartError extends Error {
  constructor() {
    super('The forecast could not be started.')
    this.name = 'ForecastStartError'
  }
}

export function parseUserGatewayApiKey(value: string | null | undefined) {
  const parsed = z.string().trim().min(20).max(500).safeParse(value)
  if (!parsed.success) throw new MissingUserApiKeyError()
  return parsed.data
}

function seedForInvestigation(id: string) {
  return createHash('sha256').update(id).digest().readInt32BE(0)
}

function ensureDemoInvestigation(investigation: Investigation) {
  if (investigation.projectId !== DEMO_PROJECT_ID) throw new DemoBoundaryError()
  return investigation
}

async function loadDemoContext(deps: InvestigationServiceDependencies) {
  const [graph, scenarios] = await Promise.all([
    deps.loadGraph(DEMO_PROJECT_ID),
    deps.loadScenarios(DEMO_PROJECT_ID),
  ])
  return { graph, scenarios }
}

async function beginRun(
  investigation: Investigation,
  runKey: string,
  deps: InvestigationServiceDependencies,
) {
  try {
    const handle = await deps.start(investigation.id, {
      runKey,
      tags: [`project:${DEMO_PROJECT_ID}`],
    })
    await deps.update(investigation.id, {
      status: 'queued',
      triggerRunId: handle.runId,
      finalResult: null,
      failureCode: null,
      failureDetail: null,
      startedAt: null,
      completedAt: null,
    })
    return handle
  } catch {
    await deps.update(investigation.id, {
      status: 'failed',
      failureCode: 'forecast_unavailable',
      failureDetail: 'The forecast could not be started. Please retry.',
      completedAt: new Date(),
    })
    throw new ForecastStartError()
  }
}

export type ChatInvestigationOutcome =
  | { kind: 'unsupported' }
  | {
      kind: 'started'
      investigationId: string
      runId: string
      publicAccessToken: string
    }

export async function createQuestionInvestigation(
  question: string,
  deps: InvestigationServiceDependencies = investigationServiceDependencies,
  options: {
    gatewayApiKey: string
    generator?: IntentGenerator
    now?: Date
  },
): Promise<ChatInvestigationOutcome> {
  const investigationId = z.uuid().parse(deps.uuid())
  const { graph, scenarios } = await loadDemoContext(deps)
  const classification = await deps.classify(
    question,
    {
      investigationId,
      project: {
        targetDate: graph.project.targetDate,
        timezone: 'Europe/London',
      },
      scenarios: scenarios.map(({ id, slug, name }) => ({ id, slug, name })),
      scopeGroups: graph.scopeGroups.map(({ id, slug, name }) => ({
        id,
        slug,
        name,
      })),
      now: options.now,
    },
    parseUserGatewayApiKey(options.gatewayApiKey),
    options.generator,
  )
  if (!classification.supported) return { kind: 'unsupported' }

  const selectedScenarioIds =
    classification.intent.kind === 'compare_scenarios'
      ? classification.intent.scenarioIds
      : []
  const created = await deps.create({
    id: investigationId,
    projectId: DEMO_PROJECT_ID,
    originalQuestion: question,
    parsedIntent: classification.intent,
    targetDate: classification.targetDate,
    selectedScenarioIds,
    randomSeed: seedForInvestigation(investigationId),
  })
  const handle = await beginRun(created as Investigation, 'initial', deps)
  return { kind: 'started', investigationId, ...handle }
}

export async function retryInvestigation(
  investigationId: string,
  deps: InvestigationServiceDependencies = investigationServiceDependencies,
) {
  const investigation = ensureDemoInvestigation(
    await deps.get(z.uuid().parse(investigationId)),
  )
  const handle = await beginRun(
    investigation,
    `retry:${z.uuid().parse(deps.uuid())}`,
    deps,
  )
  return {
    investigationId: investigation.id,
    ...handle,
    parsedIntent: investigation.parsedIntent,
    randomSeed: investigation.randomSeed,
  }
}

export async function createScenarioInvestigation(
  scenarioId: string,
  body: unknown,
  deps: InvestigationServiceDependencies = investigationServiceDependencies,
) {
  const id = z.uuid().parse(scenarioId)
  const request = z
    .object({ targetDate: z.iso.date().optional() })
    .strict()
    .parse(body ?? {})
  const { graph, scenarios } = await loadDemoContext(deps)
  const scenario = scenarios.find((candidate) => candidate.id === id)
  if (!scenario) throw new DemoBoundaryError()
  const investigationId = z.uuid().parse(deps.uuid())
  const baseline = scenario.slug === 'baseline'
  const intent = investigationIntentSchema.parse(
    baseline
      ? { kind: 'deadline_probability', targetDate: request.targetDate }
      : {
          kind: 'compare_scenarios',
          scenarioIds: [scenario.id],
          targetDate: request.targetDate,
        },
  )
  const created = await deps.create({
    id: investigationId,
    projectId: DEMO_PROJECT_ID,
    originalQuestion: `Forecast saved scenario: ${scenario.name}`,
    parsedIntent: intent,
    targetDate: request.targetDate ?? graph.project.targetDate,
    selectedScenarioIds: baseline ? [] : [scenario.id],
    randomSeed: seedForInvestigation(investigationId),
  })
  const handle = await beginRun(created as Investigation, 'scenario', deps)
  return { investigationId, ...handle }
}

export async function getDemoProject(
  deps: InvestigationServiceDependencies = investigationServiceDependencies,
) {
  const { graph, scenarios } = await loadDemoContext(deps)
  return { ...graph, scenarios }
}

export async function getDemoInvestigation(
  investigationId: string,
  deps: InvestigationServiceDependencies = investigationServiceDependencies,
) {
  return ensureDemoInvestigation(
    await deps.get(z.uuid().parse(investigationId)),
  )
}

function writeText(
  writer: Parameters<
    Parameters<typeof createUIMessageStream<BuildGraphUIMessage>>[0]['execute']
  >[0]['writer'],
  id: string,
  text: string,
) {
  writer.write({ type: 'text-start', id })
  writer.write({ type: 'text-delta', id, delta: text })
  writer.write({ type: 'text-end', id })
}

export function chatOutcomeResponse(outcome: ChatInvestigationOutcome) {
  const stream = createUIMessageStream<BuildGraphUIMessage>({
    execute: ({ writer }) => {
      if (outcome.kind === 'unsupported') {
        writeText(
          writer,
          'unsupported-status',
          'I can investigate delivery dates, blockers, confidence targets, or saved scenarios.',
        )
        writer.write({
          type: 'data-unsupported',
          id: 'unsupported-question',
          data: {
            code: 'unsupported_question',
            suggestions: [...unsupportedSuggestions],
          },
        })
        return
      }
      writeText(
        writer,
        `status-${outcome.investigationId}`,
        'Forecast started. Live dependency and probability evidence will appear here.',
      )
      writer.write({
        type: 'data-investigation',
        id: outcome.investigationId,
        data: outcome,
      })
    },
    onError: () => 'The investigation response could not be streamed.',
  })
  return createUIMessageStreamResponse({ stream })
}

export function serializeInvestigation(investigation: Investigation) {
  return {
    id: investigation.id,
    status: investigation.status,
    parsedIntent: investigation.parsedIntent,
    targetDate: investigation.targetDate,
    selectedScenarioIds: investigation.selectedScenarioIds,
    triggerRunId: investigation.triggerRunId,
    result: investigation.finalResult,
    error:
      investigation.status === 'failed'
        ? {
            code: investigation.failureCode ?? 'forecast_unavailable',
            detail:
              investigation.failureDetail ??
              'The forecast did not complete. Please retry.',
          }
        : null,
  }
}
