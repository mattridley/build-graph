import 'server-only'

import { createGateway, generateText, Output } from 'ai'
import { z } from 'zod'

import {
  investigationIntentSchema,
  type InvestigationIntent,
} from '@/lib/contracts/forecast'
import { readOptionalRuntimeEnvironment } from '@/lib/env'

const targetDate = z.string().trim().min(1).max(40).nullable()

export const modelIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('deadline_probability'), targetDate }),
  z.object({ kind: z.literal('blocker_analysis'), targetDate }),
  z.object({
    kind: z.literal('scope_to_confidence'),
    targetDate,
    confidence: z.number().nullable(),
  }),
  z.object({
    kind: z.literal('compare_scenarios'),
    targetDate,
    scenarioReferences: z.array(z.string().trim().min(1).max(200)).max(2),
  }),
  z.object({ kind: z.literal('unsupported') }),
])

export type ModelIntent = z.infer<typeof modelIntentSchema>

export interface IntentContext {
  investigationId: string
  project: {
    targetDate: string
    timezone: 'Europe/London'
  }
  scenarios: Array<{ id: string; slug: string; name: string }>
  scopeGroups: Array<{ id: string; slug: string; name: string }>
  now?: Date
}

export type IntentClassification =
  | { supported: true; intent: InvestigationIntent; targetDate: string }
  | { supported: false }

export interface IntentGenerator {
  (input: {
    question: string
    context: IntentContext
    gatewayApiKey: string
  }): Promise<unknown>
}

export class IntentProviderError extends Error {
  constructor(options?: ErrorOptions) {
    super('Intent classification is temporarily unavailable.', options)
    this.name = 'IntentProviderError'
  }
}

const systemInstruction =
  'Classify Atlas delivery questions into one approved intent. Never invent state, write SQL, calculate forecasts, or produce prose. Use only supplied scenario and scope references; otherwise return unsupported.'

async function gatewayIntentGenerator({
  question,
  context,
  gatewayApiKey,
}: {
  question: string
  context: IntentContext
  gatewayApiKey: string
}) {
  const { AI_MODEL } = readOptionalRuntimeEnvironment()
  const gateway = createGateway({ apiKey: gatewayApiKey })
  const { output } = await generateText({
    model: gateway(AI_MODEL ?? 'openai/gpt-5.4'),
    system: systemInstruction,
    output: Output.object({ schema: modelIntentSchema }),
    prompt: JSON.stringify({
      question,
      projectTimezone: context.project.timezone,
      projectTargetDate: context.project.targetDate,
      scenarios: context.scenarios,
      scopeGroups: context.scopeGroups,
    }),
    providerOptions: {
      gateway: {
        tags: [
          'feature:investigation-classifier',
          `investigation:${context.investigationId}`,
        ],
      },
    },
  })
  return output
}

function dateInTimezone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const weekdays = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

export function resolveTargetDate(
  expression: string | null | undefined,
  context: Pick<IntentContext, 'project' | 'now'>,
) {
  if (!expression) return z.iso.date().parse(context.project.targetDate)
  const normalized = expression.trim().toLowerCase()
  const direct = z.iso.date().safeParse(normalized)
  if (direct.success) return direct.data

  const today = dateInTimezone(
    context.now ?? new Date(),
    context.project.timezone,
  )
  if (normalized === 'today') return today
  if (normalized === 'tomorrow') return addCalendarDays(today, 1)

  const weekday = weekdays.findIndex(
    (name) => normalized === name || normalized === `next ${name}`,
  )
  if (weekday >= 0) {
    const current = new Date(`${today}T12:00:00.000Z`).getUTCDay()
    let offset = (weekday - current + 7) % 7
    if (normalized.startsWith('next ')) offset = offset === 0 ? 7 : offset + 7
    return addCalendarDays(today, offset)
  }

  throw new RangeError('Unsupported target date')
}

function resolveScenarioIds(references: string[], context: IntentContext) {
  if (references.length === 0 || references.length > 2) return null
  const ids = references.map((reference) => {
    const normalized = reference.trim().toLowerCase()
    return context.scenarios.find(
      (scenario) =>
        scenario.id.toLowerCase() === normalized ||
        scenario.slug.toLowerCase() === normalized ||
        scenario.name.toLowerCase() === normalized,
    )?.id
  })
  if (ids.some((id) => !id)) return null
  return [...new Set(ids as string[])]
}

export async function classifyInvestigationIntent(
  question: string,
  context: IntentContext,
  gatewayApiKey: string,
  generator: IntentGenerator = gatewayIntentGenerator,
): Promise<IntentClassification> {
  let generated: unknown
  try {
    generated = await generator({ question, context, gatewayApiKey })
  } catch (error) {
    throw new IntentProviderError({ cause: error })
  }
  try {
    const output = modelIntentSchema.parse(generated)
    if (output.kind === 'unsupported') return { supported: false }
    const resolvedDate = resolveTargetDate(output.targetDate, context)
    if (output.kind === 'compare_scenarios') {
      const scenarioIds = resolveScenarioIds(output.scenarioReferences, context)
      if (!scenarioIds?.length) return { supported: false }
      const intent = investigationIntentSchema.parse({
        kind: output.kind,
        scenarioIds,
        targetDate: resolvedDate,
      })
      return { supported: true, intent, targetDate: resolvedDate }
    }
    const intent = investigationIntentSchema.parse({
      kind: output.kind,
      targetDate: resolvedDate,
      ...(output.kind === 'scope_to_confidence'
        ? { confidence: output.confidence ?? 0.8 }
        : {}),
    })
    return { supported: true, intent, targetDate: resolvedDate }
  } catch {
    return { supported: false }
  }
}
