import { NextResponse } from 'next/server'

import { investigationResponseSchema } from '@/lib/ai/contracts'
import { safeApiError } from '@/lib/ai/http'
import {
  getDemoInvestigation,
  serializeInvestigation,
} from '@/lib/ai/investigation-service'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const response = serializeInvestigation(await getDemoInvestigation(id))
    return NextResponse.json(investigationResponseSchema.parse(response))
  } catch (error) {
    return safeApiError(error)
  }
}
