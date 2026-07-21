import { z } from 'zod'

export const investigationIntentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('deadline_probability'),
    targetDate: z.iso.date().optional(),
  }),
  z.object({
    kind: z.literal('blocker_analysis'),
    targetDate: z.iso.date().optional(),
  }),
  z.object({
    kind: z.literal('scope_to_confidence'),
    targetDate: z.iso.date().optional(),
    confidence: z.number().min(0).max(1).default(0.8),
  }),
  z.object({
    kind: z.literal('compare_scenarios'),
    scenarioIds: z.array(z.uuid()).min(1),
    targetDate: z.iso.date().optional(),
  }),
])

const deliveryNodeSchema = z.object({ id: z.string().min(1) }).passthrough()

const deliveryEdgeSchema = z
  .object({
    source: z.string().min(1),
    target: z.string().min(1),
  })
  .passthrough()

export const forecastResultSchema = z.object({
  investigationId: z.uuid(),
  verdict: z.object({
    headline: z.string().min(1),
    targetDate: z.iso.date(),
    onTimeProbability: z.number().min(0).max(1),
    deltaPercentagePoints: z.number(),
    modelDisclaimer: z.string().min(1),
  }),
  graph: z.object({
    nodes: z.array(deliveryNodeSchema),
    edges: z.array(deliveryEdgeSchema),
    criticalPathIds: z.array(z.string()),
    highlightedBlockerIds: z.array(z.string()),
    excludedNodeIds: z.array(z.string()),
  }),
  distribution: z.object({
    buckets: z.array(
      z.object({ date: z.iso.date(), count: z.number().int().nonnegative() }),
    ),
    p50: z.iso.date(),
    p80: z.iso.date(),
    p95: z.iso.date(),
  }),
  interventions: z.array(
    z.object({
      scenarioId: z.uuid(),
      label: z.string().min(1),
      probability: z.number().min(0).max(1),
      deltaPercentagePoints: z.number(),
      excludedScopeGroups: z.array(z.string()),
    }),
  ),
  evidence: z.array(
    z.object({
      label: z.string().min(1),
      value: z.string(),
      source: z.enum(['clickhouse', 'postgres', 'simulation']),
      detail: z.string(),
    }),
  ),
})

export type InvestigationIntent = z.infer<typeof investigationIntentSchema>
export type ForecastResult = z.infer<typeof forecastResultSchema>
