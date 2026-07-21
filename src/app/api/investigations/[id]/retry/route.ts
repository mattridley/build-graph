import { NextResponse } from 'next/server'

import { safeApiError } from '@/lib/ai/http'
import { retryInvestigation } from '@/lib/ai/investigation-service'
import { investigationDataSchema } from '@/lib/ai/contracts'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const result = await retryInvestigation(id)
    return NextResponse.json(
      investigationDataSchema.parse({
        investigationId: result.investigationId,
        runId: result.runId,
        publicAccessToken: result.publicAccessToken,
      }),
      { status: 202 },
    )
  } catch (error) {
    return safeApiError(error)
  }
}
