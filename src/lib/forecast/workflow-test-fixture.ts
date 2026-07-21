import { deterministicDemoUuid } from '@/lib/demo/uuid'
import type {
  ForecastDistributions,
  ForecastEngineInput,
  ForecastScenario,
} from '@/lib/forecast/types'

const fixed = (hours: number) => ({
  p25: hours,
  p50: hours,
  p90: hours,
  sampleCount: 100,
})

export const workflowIds = {
  investigation: deterministicDemoUuid('workflow-test:investigation'),
  project: deterministicDemoUuid('workflow-test:project'),
  core: deterministicDemoUuid('workflow-test:core'),
  first: deterministicDemoUuid('workflow-test:first'),
  blocker: deterministicDemoUuid('workflow-test:blocker'),
  release: deterministicDemoUuid('workflow-test:release'),
  baseline: deterministicDemoUuid('workflow-test:baseline'),
} as const

export const workflowScenario: ForecastScenario = {
  id: workflowIds.baseline,
  slug: 'baseline',
  name: 'Baseline',
  excludedScopeGroupIds: [],
  resolvedBlockerIds: [],
}

export const workflowDistributions: ForecastDistributions = {
  cycle: [
    { kind: 'task', size: 'm', ...fixed(2) },
    { kind: 'test', size: 's', ...fixed(3) },
  ],
  blocked: [{ kind: 'test', ...fixed(1) }],
  globalCycle: fixed(2),
  globalBlocked: fixed(1),
  ci: {
    failureProbability: 0,
    durationP50Seconds: 60,
    durationP90Seconds: 120,
  },
}

export function workflowEngineInput(): ForecastEngineInput {
  return {
    investigationId: workflowIds.investigation,
    seed: 123_456,
    sampleCount: 2_500,
    shardSize: 250,
    project: {
      id: workflowIds.project,
      name: 'Workflow fixture',
      timezone: 'Europe/London',
      forecastAnchorAt: '2026-07-21T08:00:00.000Z',
      targetDate: '2026-07-31',
      workingDayStart: '09:00:00',
      workingDayEnd: '17:00:00',
      enabledWeekdays: [1, 2, 3, 4, 5],
    },
    scopeGroups: [
      {
        id: workflowIds.core,
        slug: 'core',
        name: 'Core',
        classification: 'core',
      },
    ],
    nodes: [
      {
        id: workflowIds.first,
        scopeGroupId: workflowIds.core,
        kind: 'task',
        status: 'todo',
        title: 'First',
        size: 'm',
        progressPercent: 0,
      },
      {
        id: workflowIds.blocker,
        scopeGroupId: workflowIds.core,
        kind: 'test',
        status: 'blocked',
        title: 'CI blocker',
        size: 's',
        progressPercent: 0,
      },
      {
        id: workflowIds.release,
        scopeGroupId: workflowIds.core,
        kind: 'milestone',
        status: 'todo',
        title: 'Release',
        size: 'xs',
        progressPercent: 0,
      },
    ],
    edges: [
      { source: workflowIds.first, target: workflowIds.blocker },
      { source: workflowIds.blocker, target: workflowIds.release },
    ],
    baselineScenario: workflowScenario,
    scenarios: [],
    distributions: workflowDistributions,
  }
}
