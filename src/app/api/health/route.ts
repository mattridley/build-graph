import { NextResponse } from 'next/server'

import { getPublicHealthResponse } from '@/lib/health'

export const dynamic = 'force-dynamic'

export async function GET() {
  const health = await getPublicHealthResponse()
  return NextResponse.json(health, {
    status: health.application.status === 'ok' ? 200 : 503,
  })
}
