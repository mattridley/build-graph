import { createHash } from 'node:crypto'

import { DEMO_HISTORY_DEFAULTS, DEMO_NOTICE } from '@/lib/demo/constants'
import { deterministicDemoUuid } from '@/lib/demo/uuid'

export interface DemoHistoryConfig {
  projectCount: number
  deliveryEventCount: number
  ciRunCount: number
  chunkSize: number
}

export const SMALL_DEMO_HISTORY_CONFIG: DemoHistoryConfig = {
  projectCount: 3,
  deliveryEventCount: 96,
  ciRunCount: 32,
  chunkSize: 17,
}

export interface DemoDeliveryEvent {
  event_id: string
  project_id: string
  item_id: string
  event_kind: string
  item_kind: 'requirement' | 'task' | 'pull_request' | 'test' | 'milestone'
  status: 'todo' | 'in_progress' | 'blocked' | 'done'
  starting_status: 'todo' | 'in_progress' | 'blocked' | 'done'
  size: 'xs' | 's' | 'm' | 'l' | 'xl'
  progress_percent: number
  duration_hours: number | null
  source: string
  actor: string | null
  properties: Record<string, unknown>
  occurred_at: string
}

export interface DemoCiRun {
  run_id: string
  workflow: string
  conclusion: string
  duration_seconds: number
  retry_count: number
  project_id: string
  item_id: string
  properties: Record<string, unknown>
  started_at: string
  completed_at: string
}

export interface DemoChunk<T> {
  index: number
  token: string
  rows: T[]
}

const eventSequence = [
  ['created', 'todo', 0],
  ['started', 'in_progress', 12],
  ['blocked', 'blocked', 30],
  ['blocked_duration', 'blocked', 30],
  ['unblocked', 'in_progress', 42],
  ['review', 'in_progress', 68],
  ['rework', 'in_progress', 76],
  ['completed', 'done', 100],
] as const

const itemKinds = [
  'requirement',
  'task',
  'task',
  'task',
  'task',
  'task',
  'task',
  'task',
  'task',
  'task',
  'task',
  'task',
  'task',
  'pull_request',
  'pull_request',
  'pull_request',
  'test',
  'test',
  'test',
  'milestone',
] as const
const sizes = ['xs', 's', 's', 'm', 'm', 'm', 'l', 'l', 'xl'] as const

const calibratedCycleHours = {
  xs: { p25: 1, p50: 3, p90: 9 },
  s: { p25: 3, p50: 7, p90: 22 },
  m: { p25: 5, p50: 12, p90: 34 },
  l: { p25: 8, p50: 20, p90: 50 },
  xl: { p25: 30, p50: 55, p90: 90 },
} as const

function completedDurationHours(
  size: DemoDeliveryEvent['size'],
  localItem: number,
  projectIndex: number,
) {
  const percentileIndex = (localItem * 17 + projectIndex * 5) % 109
  const distribution = calibratedCycleHours[size]
  if (percentileIndex <= 40) return distribution.p25
  if (percentileIndex <= 96) return distribution.p50
  return distribution.p90
}

function assertConfig(config: DemoHistoryConfig) {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isInteger(value) || value < 1)
      throw new RangeError(`${name} must be a positive integer`)
  }
  if (config.chunkSize > 2_000)
    throw new RangeError('chunkSize must not exceed 2,000')
  return config
}

export function historicalProject(index: number) {
  return {
    id: deterministicDemoUuid(`history:project:${index + 1}`),
    slug: `atlas-history-${String(index + 1).padStart(2, '0')}`,
    name: `Atlas synthetic history ${String(index + 1).padStart(2, '0')}`,
    description: `${DEMO_NOTICE} Completed calibration cohort ${index + 1}.`,
    timezone: 'Europe/London',
    targetDate: `${2023 + (index % 3)}-03-31`,
    forecastAnchorAt: `${2023 + (index % 3)}-01-03T09:00:00.000Z`,
    workingDayStart: '09:00:00',
    workingDayEnd: '17:00:00',
    enabledWeekdays: [1, 2, 3, 4, 5],
    createdAt: `${2023 + (index % 3)}-01-02T09:00:00.000Z`,
    updatedAt: `${2023 + (index % 3)}-03-31T17:00:00.000Z`,
  }
}

export function historicalProjects(
  count: number = DEMO_HISTORY_DEFAULTS.projectCount,
) {
  return Array.from({ length: count }, (_, index) => historicalProject(index))
}

const businessDateCache = new Map<string, Date>()

function businessDate(projectIndex: number, localItem: number) {
  const dayIndex = localItem % 45
  const key = `${projectIndex}:${dayIndex}`
  const cached = businessDateCache.get(key)
  if (cached) return new Date(cached)
  const date = new Date(Date.UTC(2023 + (projectIndex % 3), 0, 2))
  let remaining = dayIndex
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    const weekday = date.getUTCDay()
    if (weekday !== 0 && weekday !== 6) remaining--
  }
  businessDateCache.set(key, new Date(date))
  return date
}

function businessTimestamp(
  projectIndex: number,
  localItem: number,
  step: number,
) {
  const date = businessDate(projectIndex, localItem)
  const minutes = 9 * 60 + step * 50
  date.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return date
}

function chunkToken(kind: string, index: number, ids: string[]) {
  const digest = createHash('sha256').update(ids.join('\n')).digest('hex')
  return `seed:${kind}:${index}:${digest}`
}

export function* generateDeliveryEventChunks(
  input: DemoHistoryConfig = DEMO_HISTORY_DEFAULTS,
): Generator<DemoChunk<DemoDeliveryEvent>> {
  const config = assertConfig(input)
  let rows: DemoDeliveryEvent[] = []
  let chunkIndex = 0
  for (
    let eventIndex = 0;
    eventIndex < config.deliveryEventCount;
    eventIndex++
  ) {
    const sequenceIndex = eventIndex % eventSequence.length
    const itemNumber = Math.floor(eventIndex / eventSequence.length)
    const projectIndex = itemNumber % config.projectCount
    const localItem = Math.floor(itemNumber / config.projectCount)
    const [eventKind, status, progress] = eventSequence[sequenceIndex]!
    const itemKind =
      itemKinds[(localItem * 7 + projectIndex) % itemKinds.length]!
    const size = sizes[(localItem * 3 + projectIndex) % sizes.length]!
    const occurredAt = businessTimestamp(projectIndex, localItem, sequenceIndex)
    rows.push({
      event_id: deterministicDemoUuid(`history:delivery:${eventIndex}`),
      project_id: historicalProject(projectIndex).id,
      item_id: deterministicDemoUuid(
        `history:item:${projectIndex}:${localItem}`,
      ),
      event_kind: eventKind,
      item_kind: itemKind,
      status,
      starting_status: 'todo',
      size,
      progress_percent: progress,
      duration_hours:
        eventKind === 'blocked_duration'
          ? 2 + ((localItem * 11 + projectIndex) % 39)
          : eventKind === 'completed'
            ? completedDurationHours(size, localItem, projectIndex)
            : null,
      source: 'synthetic-atlas-generator',
      actor: null,
      properties: {
        synthetic: true,
        sequenceIndex,
        cohort: projectIndex + 1,
        behaviour: eventKind === 'rework' ? 'review-feedback' : 'normal-flow',
      },
      occurred_at: occurredAt.toISOString(),
    })
    if (
      rows.length === config.chunkSize ||
      eventIndex === config.deliveryEventCount - 1
    ) {
      yield {
        index: chunkIndex,
        token: chunkToken(
          'delivery',
          chunkIndex,
          rows.map((row) => row.event_id),
        ),
        rows,
      }
      rows = []
      chunkIndex++
    }
  }
}

const workflows = [
  { name: 'unit', failureEvery: 20, baseDuration: 95 },
  { name: 'integration', failureEvery: 6, baseDuration: 420 },
  { name: 'browser', failureEvery: 9, baseDuration: 260 },
  { name: 'security', failureEvery: 34, baseDuration: 180 },
] as const

export function* generateCiRunChunks(
  input: DemoHistoryConfig = DEMO_HISTORY_DEFAULTS,
): Generator<DemoChunk<DemoCiRun>> {
  const config = assertConfig(input)
  let rows: DemoCiRun[] = []
  let chunkIndex = 0
  for (let runIndex = 0; runIndex < config.ciRunCount; runIndex++) {
    const projectIndex = runIndex % config.projectCount
    const localItem = Math.floor(runIndex / config.projectCount)
    const workflow =
      workflows[(runIndex * 5 + projectIndex) % workflows.length]!
    const failed = (localItem + projectIndex * 3) % workflow.failureEvery === 0
    const retryCount = failed ? 1 + (runIndex % 2) : runIndex % 13 === 0 ? 1 : 0
    const duration =
      workflow.baseDuration +
      ((localItem * 29 + projectIndex * 7) % workflow.baseDuration)
    const startedAt = businessTimestamp(projectIndex, localItem, runIndex % 8)
    const completedAt = new Date(startedAt.getTime() + duration * 1_000)
    const runId = `atlas-synthetic-${String(runIndex).padStart(6, '0')}`
    rows.push({
      run_id: runId,
      workflow: workflow.name,
      conclusion: failed ? 'failure' : 'success',
      duration_seconds: duration,
      retry_count: retryCount,
      project_id: historicalProject(projectIndex).id,
      item_id: deterministicDemoUuid(
        `history:item:${projectIndex}:${localItem}`,
      ),
      properties: {
        synthetic: true,
        cohort: projectIndex + 1,
        failureMode:
          failed && workflow.name === 'integration'
            ? 'fixture-instability'
            : null,
      },
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
    })
    if (
      rows.length === config.chunkSize ||
      runIndex === config.ciRunCount - 1
    ) {
      yield {
        index: chunkIndex,
        token: chunkToken(
          'ci',
          chunkIndex,
          rows.map((row) => row.run_id),
        ),
        rows,
      }
      rows = []
      chunkIndex++
    }
  }
}

export function historyManifest(
  config: DemoHistoryConfig = DEMO_HISTORY_DEFAULTS,
) {
  const valid = assertConfig(config)
  return {
    ...valid,
    firstProjectId: historicalProject(0).id,
    lastProjectId: historicalProject(valid.projectCount - 1).id,
    firstDeliveryEventId: deterministicDemoUuid('history:delivery:0'),
    lastDeliveryEventId: deterministicDemoUuid(
      `history:delivery:${valid.deliveryEventCount - 1}`,
    ),
    firstCiRunId: 'atlas-synthetic-000000',
    lastCiRunId: `atlas-synthetic-${String(valid.ciRunCount - 1).padStart(6, '0')}`,
  }
}

export function buildSmallDemoHistoryFixture() {
  return {
    manifest: historyManifest(SMALL_DEMO_HISTORY_CONFIG),
    deliveryChunks: [...generateDeliveryEventChunks(SMALL_DEMO_HISTORY_CONFIG)],
    ciChunks: [...generateCiRunChunks(SMALL_DEMO_HISTORY_CONFIG)],
  }
}
