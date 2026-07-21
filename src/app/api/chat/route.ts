import { parseChatRequest } from '@/lib/ai/contracts'
import { safeApiError } from '@/lib/ai/http'
import {
  chatOutcomeResponse,
  createQuestionInvestigation,
  parseUserGatewayApiKey,
} from '@/lib/ai/investigation-service'

export const dynamic = 'force-dynamic'

export async function handleChatRequest(
  request: Request,
  create: typeof createQuestionInvestigation = createQuestionInvestigation,
) {
  try {
    const { question } = await parseChatRequest(await request.json())
    const gatewayApiKey = parseUserGatewayApiKey(
      request.headers.get('x-buildgraph-ai-gateway-key'),
    )
    const outcome = await create(question, undefined, { gatewayApiKey })
    return chatOutcomeResponse(outcome)
  } catch (error) {
    return safeApiError(error)
  }
}

export async function POST(request: Request) {
  return handleChatRequest(request)
}
