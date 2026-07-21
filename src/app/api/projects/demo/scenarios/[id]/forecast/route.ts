import { NextResponse } from 'next/server'

import { investigationDataSchema } from '@/lib/ai/contracts'
import { safeApiError } from '@/lib/ai/http'
import { createScenarioInvestigation } from '@/lib/ai/investigation-service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const text = await request.text()
    const result = await createScenarioInvestigation(
      id,
      text ? JSON.parse(text) : {},
    )
    return NextResponse.json(investigationDataSchema.parse(result), {
      status: 202,
    })
  } catch (error) {
    return safeApiError(error)
  }
}
