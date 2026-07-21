import 'server-only'

import { tasks } from '@trigger.dev/sdk'
import { z } from 'zod'

import type { forecastReleaseTask } from '@/trigger/forecast'
import {
  forecastProgressSchema,
  forecastRunHandleSchema,
} from '@/lib/forecast/workflow-contracts'

export async function startForecastRelease(investigationId: string) {
  const id = z.uuid().parse(investigationId)
  const handle = await tasks.trigger<typeof forecastReleaseTask>(
    'forecast-release',
    { investigationId: id },
    {
      idempotencyKey: ['forecast-release', id],
      idempotencyKeyTTL: '7d',
      tags: [`investigation:${id}`],
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
