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

export function safeApiError(error: unknown) {
  if (error instanceof MissingUserApiKeyError) {
    return NextResponse.json(
      {
        error: {
          code: 'user_api_key_required',
          detail: 'Add your own Vercel AI Gateway API key to use AI analysis.',
        },
      },
      { status: 401 },
    )
  }
  if (
    error instanceof z.ZodError ||
    error instanceof InvalidChatRequestError ||
    error instanceof SyntaxError
  ) {
    return NextResponse.json(
      { error: { code: 'invalid_request', detail: 'The request is invalid.' } },
      { status: 400 },
    )
  }
  if (error instanceof RecordNotFoundError) {
    return NextResponse.json(
      { error: { code: 'not_found', detail: 'The resource was not found.' } },
      { status: 404 },
    )
  }
  if (error instanceof DemoBoundaryError) {
    return NextResponse.json(
      { error: { code: 'not_found', detail: 'The resource was not found.' } },
      { status: 404 },
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
      { status: 503 },
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
      { status: 503 },
    )
  }
  return NextResponse.json(
    {
      error: {
        code: 'investigation_unavailable',
        detail: 'The investigation is temporarily unavailable.',
      },
    },
    { status: 503 },
  )
}
