import { NextResponse } from 'next/server'

import { investigationDataSchema } from '@/lib/ai/contracts'
import { safeApiError } from '@/lib/ai/http'
import { createScenarioInvestigation } from '@/lib/ai/investigation-service'
import {
  correlationHeaders,
  createCorrelationId,
  logApiEvent,
} from '@/lib/observability'
import { consumeRateLimit, requestClientKey } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = createCorrelationId()
  const route = '/api/projects/demo/scenarios/:id/forecast'
  const startedAt = performance.now()
  try {
    const rate = consumeRateLimit(`forecast:${requestClientKey(request)}`)
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'rate_limited',
            detail: 'Too many forecast requests. Please retry shortly.',
          },
        },
        {
          status: 429,
          headers: {
            ...correlationHeaders(correlationId),
            'retry-after': String(rate.retryAfterSeconds),
          },
        },
      )
    }
    const { id } = await context.params
    const text = await request.text()
    const result = await createScenarioInvestigation(
      id,
      text ? JSON.parse(text) : {},
      undefined,
      { investigationId: correlationId },
    )
    logApiEvent('info', {
      correlationId,
      route,
      event: 'request.completed',
      status: 202,
      durationMs: Math.round(performance.now() - startedAt),
      investigationId: result.investigationId,
    })
    return NextResponse.json(investigationDataSchema.parse(result), {
      status: 202,
      headers: correlationHeaders(correlationId),
    })
  } catch (error) {
    return safeApiError(error, { correlationId, route })
  }
}
