import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

export const CORRELATION_HEADER = 'x-correlation-id'

type LogLevel = 'info' | 'warn' | 'error'

export interface LogContext {
  correlationId: string
  route: string
  event: string
  status?: number
  durationMs?: number
  investigationId?: string
  errorType?: string
}

export function createCorrelationId() {
  return randomUUID()
}

export function correlationHeaders(correlationId: string) {
  return { [CORRELATION_HEADER]: correlationId, 'cache-control': 'no-store' }
}

export function logApiEvent(level: LogLevel, context: LogContext) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'build-graph',
    ...context,
  })

  if (level === 'error') console.error(entry)
  else if (level === 'warn') console.warn(entry)
  else console.info(entry)
}

export function jsonWithCorrelation(
  body: unknown,
  correlationId: string,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: correlationHeaders(correlationId),
  })
}
