import 'server-only'

import { tasks } from '@trigger.dev/sdk'
import { z } from 'zod'

import type { forecastReleaseTask } from '@/trigger/forecast'
import {
  forecastProgressSchema,
  forecastRunHandleSchema,
} from '@/lib/forecast/workflow-contracts'

export async function startForecastRelease(
  investigationId: string,
  options: { runKey?: string; tags?: string[] } = {},
) {
  const id = z.uuid().parse(investigationId)
  const runKey = options.runKey
    ? z.string().trim().min(1).max(200).parse(options.runKey)
    : 'initial'
  const handle = await tasks.trigger<typeof forecastReleaseTask>(
    'forecast-release',
    { investigationId: id },
    {
      idempotencyKey: ['forecast-release', id, runKey],
      idempotencyKeyTTL: '7d',
      tags: [`investigation:${id}`, ...(options.tags ?? [])],
    },
  )
  return forecastRunHandleSchema.parse({
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
  })
}

export function parseForecastRealtimeMetadata(metadata: unknown) {
  return forecastProgressSchema.parse(metadata)
}
