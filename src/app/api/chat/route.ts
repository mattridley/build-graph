import { parseChatRequest } from '@/lib/ai/contracts'
import { safeApiError } from '@/lib/ai/http'
import {
  chatOutcomeResponse,
  createQuestionInvestigation,
  parseUserGatewayApiKey,
} from '@/lib/ai/investigation-service'
import {
  correlationHeaders,
  createCorrelationId,
  logApiEvent,
} from '@/lib/observability'
import { consumeRateLimit, requestClientKey } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function handleChatRequest(
  request: Request,
  create: typeof createQuestionInvestigation = createQuestionInvestigation,
) {
  const correlationId = createCorrelationId()
  const route = '/api/chat'
  const startedAt = performance.now()
  try {
    const rate = consumeRateLimit(`chat:${requestClientKey(request)}`)
    if (!rate.allowed) {
      logApiEvent('warn', {
        correlationId,
        route,
        event: 'request.rate_limited',
        status: 429,
      })
      return Response.json(
        {
          error: {
            code: 'rate_limited',
            detail: 'Too many analysis requests. Please retry shortly.',
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
    const { question } = await parseChatRequest(await request.json())
    const gatewayApiKey = parseUserGatewayApiKey(
      request.headers.get('x-buildgraph-ai-gateway-key'),
    )
    const outcome = await create(question, undefined, {
      gatewayApiKey,
      investigationId: correlationId,
    })
    logApiEvent('info', {
      correlationId,
      route,
      event: 'request.completed',
      status: 200,
      durationMs: Math.round(performance.now() - startedAt),
      investigationId:
        outcome.kind === 'started' ? outcome.investigationId : undefined,
    })
    return chatOutcomeResponse(outcome, correlationHeaders(correlationId))
  } catch (error) {
    return safeApiError(error, { correlationId, route })
  }
}

export async function POST(request: Request) {
  return handleChatRequest(request)
}
