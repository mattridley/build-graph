import { NextResponse } from 'next/server'
import { z } from 'zod'

import { InvalidChatRequestError } from '@/lib/ai/contracts'
import {
  DemoBoundaryError,
  ForecastStartError,
  MissingUserApiKeyError,
} from '@/lib/ai/investigation-service'
import { IntentProviderError } from '@/lib/ai/intent'
import { RecordNotFoundError } from '@/lib/postgres/repositories'
import { correlationHeaders, logApiEvent } from '@/lib/observability'

export function safeApiError(
  error: unknown,
  context: { correlationId?: string; route?: string } = {},
) {
  const correlationId = context.correlationId
  const headers = correlationId ? correlationHeaders(correlationId) : undefined
  if (correlationId && context.route) {
    logApiEvent('error', {
      correlationId,
      route: context.route,
      event: 'request.failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
  }
  if (error instanceof MissingUserApiKeyError) {
    return NextResponse.json(
      {
        error: {
          code: 'user_api_key_required',
          detail: 'Add your own Vercel AI Gateway API key to use AI analysis.',
        },
      },
      { status: 401, headers },
    )
  }
  if (
    error instanceof z.ZodError ||
    error instanceof InvalidChatRequestError ||
    error instanceof SyntaxError
  ) {
    return NextResponse.json(
      { error: { code: 'invalid_request', detail: 'The request is invalid.' } },
      { status: 400, headers },
    )
  }
  if (error instanceof RecordNotFoundError) {
    return NextResponse.json(
      { error: { code: 'not_found', detail: 'The resource was not found.' } },
      { status: 404, headers },
    )
  }
  if (error instanceof DemoBoundaryError) {
    return NextResponse.json(
      { error: { code: 'not_found', detail: 'The resource was not found.' } },
      { status: 404, headers },
    )
  }
  if (error instanceof IntentProviderError) {
    return NextResponse.json(
      {
        error: {
          code: 'classification_unavailable',
          detail: 'Question classification is temporarily unavailable.',
        },
      },
      { status: 503, headers },
    )
  }
  if (error instanceof ForecastStartError) {
    return NextResponse.json(
      {
        error: {
          code: 'forecast_unavailable',
          detail: 'The forecast could not be started. Please retry.',
        },
      },
      { status: 503, headers },
    )
  }
  return NextResponse.json(
    {
      error: {
        code: 'investigation_unavailable',
        detail: 'The investigation is temporarily unavailable.',
      },
    },
    { status: 503, headers },
  )
}
