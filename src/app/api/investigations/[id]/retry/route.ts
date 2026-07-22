import { NextResponse } from 'next/server'

import { safeApiError } from '@/lib/ai/http'
import { retryInvestigation } from '@/lib/ai/investigation-service'
import { investigationDataSchema } from '@/lib/ai/contracts'
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
  const requestCorrelationId = createCorrelationId()
  const route = '/api/investigations/:id/retry'
  try {
    const rate = consumeRateLimit(`retry:${requestClientKey(request)}`, {
      limit: 5,
    })
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'rate_limited',
            detail: 'Too many retry requests. Please retry shortly.',
          },
        },
        {
          status: 429,
          headers: {
            ...correlationHeaders(requestCorrelationId),
            'retry-after': String(rate.retryAfterSeconds),
          },
        },
      )
    }
    const { id } = await context.params
    const result = await retryInvestigation(id)
    logApiEvent('info', {
      correlationId: result.investigationId,
      route,
      event: 'request.completed',
      status: 202,
      investigationId: result.investigationId,
    })
    return NextResponse.json(
      investigationDataSchema.parse({
        investigationId: result.investigationId,
        runId: result.runId,
        publicAccessToken: result.publicAccessToken,
      }),
      {
        status: 202,
        headers: correlationHeaders(result.investigationId),
      },
    )
  } catch (error) {
    return safeApiError(error, {
      correlationId: requestCorrelationId,
      route,
    })
  }
}
