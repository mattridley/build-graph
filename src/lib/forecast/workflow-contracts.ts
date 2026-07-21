import { z } from 'zod'

const uuid = z.uuid()
const kind = z.enum([
  'requirement',
  'task',
  'pull_request',
  'test',
  'milestone',
])
const status = z.enum(['todo', 'in_progress', 'blocked', 'done'])
const size = z.enum(['xs', 's', 'm', 'l', 'xl'])
const triangular = z.object({
  p25: z.number().nonnegative(),
  p50: z.number().nonnegative(),
  p90: z.number().nonnegative(),
  sampleCount: z.number().int().positive(),
})
const scenario = z.object({
  id: uuid,
  slug: z.string().min(1),
  name: z.string().min(1),
  excludedScopeGroupIds: z.array(uuid),
  resolvedBlockerIds: z.array(uuid),
})

export const forecastEngineInputSchema = z.object({
  investigationId: uuid,
  seed: z.number().int(),
  sampleCount: z.number().int().positive().optional(),
  shardSize: z.number().int().positive().optional(),
  project: z.object({
    id: uuid,
    name: z.string().min(1),
    timezone: z.literal('Europe/London'),
    forecastAnchorAt: z.iso.datetime({ offset: true }),
    targetDate: z.iso.date(),
    workingDayStart: z.literal('09:00:00'),
    workingDayEnd: z.literal('17:00:00'),
    enabledWeekdays: z.array(z.number().int()).length(5),
  }),
  scopeGroups: z.array(
    z.object({
      id: uuid,
      slug: z.string().min(1),
      name: z.string().min(1),
      classification: z.enum(['core', 'optional']),
    }),
  ),
  nodes: z.array(
    z.object({
      id: uuid,
      scopeGroupId: uuid.nullable(),
      kind,
      status,
      title: z.string().min(1),
      size,
      progressPercent: z.number().min(0).max(100),
      graphX: z.number().nullable().optional(),
      graphY: z.number().nullable().optional(),
    }),
  ),
  edges: z.array(z.object({ source: uuid, target: uuid })),
  baselineScenario: scenario,
  scenarios: z.array(scenario).optional(),
  distributions: z.object({
    cycle: z.array(
      triangular.extend({ kind: kind.optional(), size: size.optional() }),
    ),
    blocked: z.array(triangular.extend({ kind: kind.optional() })),
    globalCycle: triangular,
    globalBlocked: triangular,
    ci: z.object({
      failureProbability: z.number().min(0).max(1),
      durationP50Seconds: z.number().nonnegative(),
      durationP90Seconds: z.number().nonnegative(),
    }),
  }),
})

export const simulationShardPayloadSchema = z.object({
  input: forecastEngineInputSchema,
  scenario,
  shardIndex: z.number().int().nonnegative(),
  firstSample: z.number().int().nonnegative(),
  sampleCount: z.number().int().min(1).max(250),
  baseSeed: z.number().int(),
})

export const simulationShardSummarySchema = z.object({
  scenarioId: uuid,
  shardIndex: z.number().int().nonnegative(),
  firstSample: z.number().int().nonnegative(),
  sampleCount: z.number().int().positive(),
  inserted: z.number().int().nonnegative(),
  checksum: z.string().length(64),
})

export const forecastProgressSchema = z.object({
  stage: z.enum([
    'loading',
    'validating',
    'simulating',
    'aggregating',
    'rendering',
    'complete',
    'failed',
  ]),
  percentage: z.number().min(0).max(100),
  completedShards: z.number().int().nonnegative(),
  totalShards: z.number().int().nonnegative(),
  scenarioLabel: z.string().max(200).nullable(),
  projectId: uuid,
  investigationId: uuid,
  seed: z.number().int(),
})

export const forecastRunHandleSchema = z.object({
  runId: z.string().min(1),
  publicAccessToken: z.string().min(1),
})

export type SimulationShardPayload = z.infer<
  typeof simulationShardPayloadSchema
>
export type SimulationShardSummary = z.infer<
  typeof simulationShardSummarySchema
>
export type ForecastProgress = z.infer<typeof forecastProgressSchema>
