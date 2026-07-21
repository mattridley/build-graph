import { createHash } from 'node:crypto'

import { assertAcyclic } from '@/lib/postgres/graph'
import {
  ATLAS_CALIBRATION,
  DEMO_GENERATOR_VERSION,
  DEMO_HISTORY_DEFAULTS,
  DEMO_NOTICE,
  DEMO_RECORDED_AT,
  DEMO_SEED,
  DEMO_UUID_NAMESPACE,
} from '@/lib/demo/constants'
import type { DemoHistoryConfig } from '@/lib/demo/history'
import { deterministicDemoUuid } from '@/lib/demo/uuid'

const titles = [
  'Define Atlas product foundations',
  'Model operational delivery data',
  'Implement repository boundaries',
  'Review ingestion API',
  'Verify storage contracts',
  'Define dependency graph experience',
  'Load project graph',
  'Lay out dependency graph',
  'Review graph interface',
  'Verify graph accessibility',
  'Define probabilistic forecast',
  'Implement Monte Carlo sampler',
  'Model London working calendar',
  'Review simulation API',
  'Verify forecast calibration',
  'Define investigation workflow',
  'Parse investigation intent',
  'Orchestrate investigation run',
  'Review streamed chat response',
  'Verify evidence citations',
  'Define delivery reliability controls',
  'Implement transactional outbox',
  'Build analytical projections',
  'Implement retry policy',
  'Review observability metadata',
  'Stabilise CI integration suite',
  'Run release rehearsal',
  'Verify end-to-end release flow',
  'Complete synthetic security review',
  'Prepare production readiness report',
  'Define audit export format',
  'Generate audit export bundle',
  'Review audit export pull request',
  'Verify audit export retention',
  'Define mobile delivery alerts',
  'Implement mobile alert routing',
  'Verify mobile alert delivery',
  'Urgent: revise mobile alert copy',
  'Define regional delivery report',
  'Generate regional report',
  'Verify regional report totals',
  'Atlas v1 release',
] as const

const kinds = [
  'requirement',
  'task',
  'task',
  'pull_request',
  'test',
  'requirement',
  'task',
  'task',
  'pull_request',
  'test',
  'requirement',
  'task',
  'task',
  'pull_request',
  'test',
  'requirement',
  'task',
  'task',
  'pull_request',
  'test',
  'requirement',
  'task',
  'task',
  'task',
  'pull_request',
  'test',
  'task',
  'test',
  'task',
  'task',
  'requirement',
  'task',
  'pull_request',
  'test',
  'requirement',
  'task',
  'test',
  'task',
  'requirement',
  'task',
  'test',
  'milestone',
] as const

export type DemoWorkItemKind = (typeof kinds)[number]
export type DemoStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type DemoSize = 'xs' | 's' | 'm' | 'l' | 'xl'

const groupDefinitions = [
  ['core', 'Core scope', 'core'],
  ['audit-export', 'Audit export', 'optional'],
  ['mobile-alerts', 'Mobile alerts', 'optional'],
  ['regional-reports', 'Regional reports', 'optional'],
] as const

function groupSlug(index: number) {
  if (index < 30 || index === 41) return 'core'
  if (index < 34) return 'audit-export'
  if (index < 38) return 'mobile-alerts'
  return 'regional-reports'
}

function statusFor(index: number): DemoStatus {
  if (index < 12) return 'done'
  if (index === 25) return 'blocked'
  if (index < 20 || index === 24) return 'in_progress'
  return 'todo'
}

function sizeFor(index: number): DemoSize {
  if (kinds[index] === 'milestone') return 'xs'
  return (['m', 's', 'l', 'm', 'xs'] as const)[index % 5]
}

export function buildAtlasFixture() {
  const projectId = deterministicDemoUuid('project:atlas')
  const groups = groupDefinitions.map(
    ([slug, name, classification], index) => ({
      id: deterministicDemoUuid(`scope:${slug}`),
      projectId,
      slug,
      name,
      description: `${name} for the fictional Atlas demonstration project.`,
      classification,
      displayOrder: index,
    }),
  )
  const groupIds = Object.fromEntries(
    groups.map((group) => [group.slug, group.id]),
  )
  const items = titles.map((title, index) => {
    const status = statusFor(index)
    const lane = groupDefinitions.findIndex(
      ([slug]) => slug === groupSlug(index),
    )
    const position = itemsInLaneBefore(index)
    return {
      id: deterministicDemoUuid(`atlas:item:${index + 1}`),
      projectId,
      scopeGroupId: groupIds[groupSlug(index)]!,
      kind: kinds[index]!,
      status,
      title,
      description: `Synthetic Atlas work item ${index + 1}; no real repository or person is represented.`,
      size: sizeFor(index),
      progressPercent:
        status === 'done'
          ? 100
          : status === 'blocked'
            ? 62
            : status === 'in_progress'
              ? 48 + (index % 4) * 9
              : 0,
      sourceUrl: null,
      sourceReference: `ATLAS-${String(index + 1).padStart(3, '0')}`,
      graphX: 120 + position * 220,
      graphY: 100 + lane * 210,
      startedAt:
        status === 'todo'
          ? null
          : `2026-06-${String(2 + (index % 20)).padStart(2, '0')}T09:00:00.000Z`,
      completedAt:
        status === 'done'
          ? `2026-06-${String(3 + (index % 20)).padStart(2, '0')}T16:00:00.000Z`
          : null,
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: DEMO_RECORDED_AT,
    }
  })

  const edgeIndexes: Array<[number, number]> = []
  for (let index = 0; index < 29; index++) edgeIndexes.push([index, index + 1])
  edgeIndexes.push([29, 41])
  for (let index = 0; index < 10; index++) edgeIndexes.push([index, index + 2])
  edgeIndexes.push([30, 31], [31, 32], [32, 33], [33, 41])
  edgeIndexes.push([34, 35], [35, 36], [36, 41], [34, 37], [37, 41])
  edgeIndexes.push([38, 39], [39, 40], [40, 41])
  const dependencies = edgeIndexes.map(([predecessor, successor]) => ({
    projectId,
    predecessorId: items[predecessor]!.id,
    successorId: items[successor]!.id,
    type: 'finish_to_start' as const,
    createdAt: DEMO_RECORDED_AT,
  }))
  assertAcyclic(
    items.map((item) => item.id),
    dependencies,
  )

  const scenarios = [
    {
      slug: 'baseline',
      name: 'Baseline',
      description: 'Current Atlas scope and observed CI instability.',
      excludedScopeGroupIds: [],
      resolvedBlockerIds: [],
    },
    {
      slug: 'defer-audit-export',
      name: 'Defer audit export',
      description: 'Move the independent audit export group beyond Atlas v1.',
      excludedScopeGroupIds: [groupIds['audit-export']!],
      resolvedBlockerIds: [],
    },
    {
      slug: 'resolve-ci-instability',
      name: 'Resolve CI instability',
      description: 'Treat the integration-suite blocker as resolved.',
      excludedScopeGroupIds: [],
      resolvedBlockerIds: [items[25]!.id],
    },
  ].map((scenario) => ({
    ...scenario,
    id: deterministicDemoUuid(`scenario:${scenario.slug}`),
    projectId,
    isSeeded: 1,
    createdAt: DEMO_RECORDED_AT,
  }))

  return {
    project: {
      id: projectId,
      slug: 'atlas',
      name: 'Atlas',
      description: `${DEMO_NOTICE} A coherent software-delivery project used to demonstrate BuildGraph.`,
      timezone: 'Europe/London',
      targetDate: '2026-08-28',
      forecastAnchorAt: DEMO_RECORDED_AT,
      workingDayStart: '09:00:00',
      workingDayEnd: '17:00:00',
      enabledWeekdays: [1, 2, 3, 4, 5],
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: DEMO_RECORDED_AT,
    },
    scopeGroups: groups,
    workItems: items,
    dependencies,
    scenarios,
    landmarks: {
      releaseMilestoneId: items[41]!.id,
      ciBlockerId: items[25]!.id,
      urgentNonCriticalId: items[37]!.id,
    },
    evidenceExamples: [
      {
        itemId: items[25]!.id,
        message:
          'Integration retries are concentrated beside the core release path.',
      },
      {
        itemId: items[33]!.id,
        message:
          'Audit export is independently deferrable without breaking core dependencies.',
      },
      {
        itemId: items[37]!.id,
        message:
          'Urgent wording work is visible but carries low critical-path weight.',
      },
    ],
    calibration: ATLAS_CALIBRATION,
  }
}

function itemsInLaneBefore(index: number) {
  const slug = groupSlug(index)
  let count = 0
  for (let candidate = 0; candidate < index; candidate++) {
    if (groupSlug(candidate) === slug) count++
  }
  return count
}

export function atlasFixtureDigest() {
  return createHash('sha256')
    .update(JSON.stringify(buildAtlasFixture()))
    .digest('hex')
}

export function atlasProvenanceManifest(
  history: DemoHistoryConfig = DEMO_HISTORY_DEFAULTS,
) {
  const fixture = buildAtlasFixture()
  return {
    seed: DEMO_SEED,
    namespaceUuid: DEMO_UUID_NAMESPACE,
    generatorVersion: DEMO_GENERATOR_VERSION,
    fixtureSha256: atlasFixtureDigest(),
    projectCount: history.projectCount + 1,
    atlasWorkItemCount: fixture.workItems.length,
    atlasDependencyCount: fixture.dependencies.length,
    scenarioCount: fixture.scenarios.length,
    deliveryEventCount: history.deliveryEventCount,
    ciRunCount: history.ciRunCount,
    fictional: true,
  }
}
