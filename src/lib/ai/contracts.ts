import type { UIMessage } from 'ai'
import { validateUIMessages } from 'ai'
import { z } from 'zod'

import {
  forecastResultSchema,
  investigationIntentSchema,
} from '@/lib/contracts/forecast'
import { forecastRunHandleSchema } from '@/lib/forecast/workflow-contracts'

export const messageMetadataSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
})

export const investigationDataSchema = forecastRunHandleSchema.extend({
  investigationId: z.uuid(),
})

export const unsupportedDataSchema = z.object({
  code: z.literal('unsupported_question'),
  suggestions: z.array(z.string().trim().min(1).max(160)).length(3),
})

export const safeErrorDataSchema = z.object({
  code: z.enum([
    'invalid_request',
    'classification_unavailable',
    'investigation_unavailable',
    'forecast_unavailable',
    'not_found',
  ]),
  detail: z.string().trim().min(1).max(240),
})

export type BuildGraphDataParts = {
  investigation: z.infer<typeof investigationDataSchema>
  unsupported: z.infer<typeof unsupportedDataSchema>
  error: z.infer<typeof safeErrorDataSchema>
}

export type BuildGraphUIMessage = UIMessage<
  z.infer<typeof messageMetadataSchema>,
  BuildGraphDataParts
>

export const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(50),
})

export class InvalidChatRequestError extends Error {
  constructor(options?: ErrorOptions) {
    super('The chat request is invalid.', options)
    this.name = 'InvalidChatRequestError'
  }
}

export async function parseChatRequest(value: unknown) {
  try {
    const input = chatRequestSchema.parse(value)
    const messages = await validateBuildGraphMessages(input.messages)
    return { messages, question: latestUserText(messages) }
  } catch (error) {
    throw new InvalidChatRequestError({ cause: error })
  }
}

export async function validateBuildGraphMessages(messages: unknown[]) {
  return validateUIMessages<BuildGraphUIMessage>({
    messages,
    metadataSchema: messageMetadataSchema.optional(),
    dataSchemas: {
      investigation: investigationDataSchema,
      unsupported: unsupportedDataSchema,
      error: safeErrorDataSchema,
    },
  })
}

export function latestUserText(messages: BuildGraphUIMessage[]) {
  const message = [...messages]
    .reverse()
    .find((candidate) => candidate.role === 'user')
  const text = message?.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
  return z.string().min(1).max(2_000).parse(text)
}

export const investigationResponseSchema = z.object({
  id: z.uuid(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  parsedIntent: investigationIntentSchema,
  targetDate: z.iso.date(),
  selectedScenarioIds: z.array(z.uuid()),
  triggerRunId: z.string().nullable(),
  result: forecastResultSchema.nullable(),
  error: z
    .object({ code: z.string().min(1), detail: z.string().min(1) })
    .nullable(),
})

export const demoProjectResponseSchema = z.object({
  project: z.object({
    id: z.uuid(),
    slug: z.literal('atlas'),
    name: z.string().min(1),
    description: z.string(),
    timezone: z.literal('Europe/London'),
    targetDate: z.iso.date(),
  }),
  scopeGroups: z.array(z.object({ id: z.uuid() }).passthrough()),
  workItems: z.array(z.object({ id: z.uuid() }).passthrough()),
  dependencies: z
    .array(
      z
        .object({ predecessorId: z.uuid(), successorId: z.uuid() })
        .passthrough(),
    )
    .max(500),
  scenarios: z.array(z.object({ id: z.uuid() }).passthrough()),
})
