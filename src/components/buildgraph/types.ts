import type { ForecastResult } from '@/lib/contracts/forecast'

export interface DashboardProject {
  project: {
    id: string
    slug: 'atlas'
    name: string
    description: string
    timezone: 'Europe/London'
    targetDate: string
  }
  scopeGroups: Array<{
    id: string
    slug: string
    name: string
    classification: 'core' | 'optional'
  }>
  workItems: Array<{
    id: string
    scopeGroupId: string | null
    kind: 'requirement' | 'task' | 'pull_request' | 'test' | 'milestone'
    status: 'todo' | 'in_progress' | 'blocked' | 'done'
    title: string
    description: string
    size: 'xs' | 's' | 'm' | 'l' | 'xl'
    progressPercent: number
    sourceReference: string | null
    graphX: number | null
    graphY: number | null
  }>
  dependencies: Array<{
    predecessorId: string
    successorId: string
  }>
  scenarios: Array<{
    id: string
    slug: string
    name: string
    description: string
    excludedScopeGroupIds: string[]
    resolvedBlockerIds: string[]
  }>
}

export type ForecastNode = ForecastResult['graph']['nodes'][number] & {
  title?: string
  description?: string
  status?: DashboardProject['workItems'][number]['status']
  kind?: DashboardProject['workItems'][number]['kind']
  size?: DashboardProject['workItems'][number]['size']
  progressPercent?: number
  sourceReference?: string | null
  graphX?: number | null
  graphY?: number | null
}

export interface ActiveForecast {
  result: ForecastResult | null
  selectedNodeId: string | null
}
