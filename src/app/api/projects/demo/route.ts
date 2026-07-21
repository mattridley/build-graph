import { NextResponse } from 'next/server'

import { demoProjectResponseSchema } from '@/lib/ai/contracts'
import { safeApiError } from '@/lib/ai/http'
import { getDemoProject } from '@/lib/ai/investigation-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(
      demoProjectResponseSchema.parse(await getDemoProject()),
    )
  } catch (error) {
    return safeApiError(error)
  }
}
