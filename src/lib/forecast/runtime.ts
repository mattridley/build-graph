import 'server-only'

import type { ClickHouseClient } from '@clickhouse/client'

import { getClickHouse } from '@/lib/clients'
import {
  queryBlockedDurationQuantiles,
  queryCiWorkflowMetrics,
  queryCycleTimeQuantiles,
} from '@/lib/clickhouse/analytics'
import type {
  ForecastDistributions,
  WorkItemKind,
  WorkItemSize,
} from '@/lib/forecast/types'
import type { WorkflowGraph } from '@/lib/forecast/orchestration'

const globalCycle = { p25: 5, p50: 12, p90: 34, sampleCount: 1 }
const globalBlocked = { p25: 13, p50: 22, p90: 34, sampleCount: 1 }

export async function loadForecastDistributions(
  projectId: string,
  graph: WorkflowGraph,
  client: ClickHouseClient = getClickHouse(),
): Promise<ForecastDistributions> {
  const uniquePairs = new Map<
    string,
    {
      kind: WorkItemKind
      size: WorkItemSize
      status: 'todo' | 'in_progress' | 'blocked' | 'done'
    }
  >()
  for (const item of graph.workItems) {
    if (item.kind === 'milestone' || item.status === 'done') continue
    uniquePairs.set(`${item.kind}:${item.size}`, {
      kind: item.kind,
      size: item.size,
      status: item.status,
    })
  }
  const cycleRows = await Promise.all(
    [...uniquePairs.values()].map(async (item) => ({
      item,
      row: await queryCycleTimeQuantiles(
        {
          projectId,
          itemKind: item.kind,
          size: item.size,
          startingStatus: item.status,
        },
        client,
      ),
    })),
  )
  const cycle: ForecastDistributions['cycle'] = []
  let resolvedGlobalCycle = globalCycle
  const seenKind = new Set<string>()
  for (const { item, row } of cycleRows) {
    if (!row) continue
    const distribution = {
      p25: row.p25,
      p50: row.p50,
      p90: row.p90,
      sampleCount: row.sample_count,
    }
    if (row.fallbackLevel === 'exact') {
      cycle.push({ kind: item.kind, size: item.size, ...distribution })
    } else if (row.fallbackLevel === 'kind' && !seenKind.has(item.kind)) {
      seenKind.add(item.kind)
      cycle.push({ kind: item.kind, ...distribution })
    } else if (row.fallbackLevel === 'global') {
      resolvedGlobalCycle = distribution
    }
  }
  const kinds = [...new Set(graph.workItems.map((item) => item.kind))].filter(
    (kind): kind is Exclude<WorkItemKind, 'milestone'> => kind !== 'milestone',
  )
  const blockedRows = await Promise.all(
    kinds.map(async (kind) => ({
      kind,
      row: await queryBlockedDurationQuantiles(projectId, kind, client),
    })),
  )
  const blocked = blockedRows
    .filter((value) => value.row !== undefined)
    .map(({ kind, row }) => ({
      kind,
      p25: row!.p25,
      p50: row!.p50,
      p90: row!.p90,
      sampleCount: row!.sample_count,
    }))
  const ci = await queryCiWorkflowMetrics('integration', client)
  return {
    cycle,
    blocked,
    globalCycle: resolvedGlobalCycle,
    globalBlocked,
    ci: ci
      ? {
          failureProbability: 1 - ci.success_rate,
          durationP50Seconds: ci.p50_duration_seconds,
          durationP90Seconds: ci.p90_duration_seconds,
        }
      : {
          failureProbability: 0.18,
          durationP50Seconds: 420,
          durationP90Seconds: 900,
        },
  }
}
