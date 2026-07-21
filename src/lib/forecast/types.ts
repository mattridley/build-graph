export type WorkItemKind =
  'requirement' | 'task' | 'pull_request' | 'test' | 'milestone'
export type WorkItemStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type WorkItemSize = 'xs' | 's' | 'm' | 'l' | 'xl'
export type ScopeClassification = 'core' | 'optional'
export type DistributionFallback = 'kind_size' | 'kind' | 'global'

export interface ForecastProject {
  id: string
  name: string
  timezone: 'Europe/London'
  forecastAnchorAt: string
  targetDate: string
  workingDayStart: '09:00:00'
  workingDayEnd: '17:00:00'
  enabledWeekdays: readonly [1, 2, 3, 4, 5] | number[]
}

export interface ForecastScopeGroup {
  id: string
  slug: string
  name: string
  classification: ScopeClassification
}

export interface ForecastNode {
  id: string
  scopeGroupId: string | null
  kind: WorkItemKind
  status: WorkItemStatus
  title: string
  size: WorkItemSize
  progressPercent: number
  graphX?: number | null
  graphY?: number | null
}

export interface ForecastEdge {
  source: string
  target: string
}

export interface ForecastScenario {
  id: string
  slug: string
  name: string
  excludedScopeGroupIds: string[]
  resolvedBlockerIds: string[]
}

export interface TriangularDistribution {
  p25: number
  p50: number
  p90: number
  sampleCount: number
}

export interface CycleDistribution extends TriangularDistribution {
  kind?: WorkItemKind
  size?: WorkItemSize
}

export interface BlockedDistribution extends TriangularDistribution {
  kind?: WorkItemKind
}

export interface CiDistribution {
  failureProbability: number
  durationP50Seconds: number
  durationP90Seconds: number
}

export interface ForecastDistributions {
  cycle: CycleDistribution[]
  blocked: BlockedDistribution[]
  globalCycle: TriangularDistribution
  globalBlocked: TriangularDistribution
  ci: CiDistribution
}

export interface ForecastEngineInput {
  investigationId: string
  seed: number
  sampleCount?: number
  shardSize?: number
  project: ForecastProject
  scopeGroups: ForecastScopeGroup[]
  nodes: ForecastNode[]
  edges: ForecastEdge[]
  baselineScenario: ForecastScenario
  scenarios?: ForecastScenario[]
  distributions: ForecastDistributions
}

export interface NodeSampleMetric {
  itemId: string
  durationHours: number
}

export interface ForecastSample {
  sampleIndex: number
  completionAt: number
  criticalPathIds: string[]
  nodeDelays: NodeSampleMetric[]
}
