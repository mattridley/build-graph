import { NextResponse } from 'next/server'

import { getPublicHealthResponse } from '@/lib/health'
import { correlationHeaders, createCorrelationId } from '@/lib/observability'

export const dynamic = 'force-dynamic'

export async function GET() {
  const correlationId = createCorrelationId()
  const health = await getPublicHealthResponse()
  return NextResponse.json(health, {
    status: health.application.status === 'ok' ? 200 : 503,
    headers: correlationHeaders(correlationId),
  })
}
