import { logger, metadata, schedules, task } from '@trigger.dev/sdk'

import { syncOutboxBatch } from '@/lib/outbox/sync'

async function runSync(correlationId: string) {
  metadata.set('correlationId', correlationId).set('stage', 'claiming')
  const result = await syncOutboxBatch({ correlationId })
  metadata
    .set('stage', result.failed > 0 ? 'failed' : 'complete')
    .set('claimed', result.claimed)
    .set('inserted', result.inserted)
    .set('skipped', result.skipped)
    .set('failed', result.failed)
    .set('dispatched', result.dispatched)
  logger.info('Outbox synchronization completed', {
    correlationId,
    claimed: result.claimed,
    inserted: result.inserted,
    skipped: result.skipped,
    failed: result.failed,
    dispatched: result.dispatched,
    failureCode: result.failureCode,
  })
  return result
}

export const syncOutboxTask = task({
  id: 'sync-outbox',
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 10_000,
    randomize: true,
  },
  run: async (payload: { correlationId: string }, { ctx }) =>
    runSync(payload.correlationId || ctx.run.id),
})

export const syncOutboxRecoveryTask = schedules.task({
  id: 'sync-outbox-recovery',
  cron: '* * * * *',
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 10_000,
    randomize: true,
  },
  run: async (_payload, { ctx }) => runSync(`recovery:${ctx.run.id}`),
})
