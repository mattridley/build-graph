import 'server-only'

import { tasks } from '@trigger.dev/sdk'

import { readOptionalRuntimeEnvironment } from '@/lib/env'

export async function requestOutboxSync(correlationId: string) {
  const environment = readOptionalRuntimeEnvironment()
  if (!environment.TRIGGER_SECRET_KEY || !environment.TRIGGER_PROJECT_REF) {
    return false
  }
  try {
    await tasks.trigger(
      'sync-outbox',
      { correlationId },
      { tags: ['outbox', `correlation:${correlationId.slice(0, 80)}`] },
    )
    return true
  } catch {
    // The one-minute recovery schedule is the durable fallback.
    return false
  }
}
