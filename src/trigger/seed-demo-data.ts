import { logger, metadata, task } from '@trigger.dev/sdk'

import { historyManifest } from '@/lib/demo/history'
import {
  ingestDemoHistory,
  seedOperationalDemoData,
  verifyDemoSeed,
} from '@/lib/demo/seed'

export const seedDemoDataTask = task({
  id: 'seed-demo-data',
  maxDuration: 1_800,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  run: async (_payload: Record<string, never>, { ctx }) => {
    metadata
      .set('correlationId', ctx.run.id)
      .set('synthetic', true)
      .set('stage', 'operational-seed')
    const operational = await seedOperationalDemoData()

    metadata.set('stage', 'history-generation')
    const history = historyManifest()

    metadata.set('stage', 'clickhouse-insertion')
    const ingestion = await ingestDemoHistory()

    metadata.set('stage', 'projection-verification')
    const verification = await verifyDemoSeed()

    metadata.set('stage', 'calibration-check').set('complete', true)
    logger.info('Synthetic Atlas demo data seeded and verified', {
      correlationId: ctx.run.id,
      synthetic: true,
      operational,
      history,
      ingestion,
      verification,
    })
    return { operational, ingestion, verification }
  },
})
