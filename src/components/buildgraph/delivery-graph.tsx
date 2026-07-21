'use client'

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type NodeTypes,
} from '@xyflow/react'
import { useMemo } from 'react'

import {
  DeliveryNode,
  type DeliveryGraphNode,
} from '@/components/buildgraph/delivery-node'
import type { DashboardProject } from '@/components/buildgraph/types'
import type { ForecastResult } from '@/lib/contracts/forecast'

const nodeTypes: NodeTypes = { delivery: DeliveryNode }

interface DeliveryGraphProps {
  project: DashboardProject
  result: ForecastResult | null
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

function criticalEdges(path: string[]) {
  return new Set(
    path.slice(0, -1).map((source, index) => `${source}:${path[index + 1]}`),
  )
}

export function buildGraphElements({
  project,
  result,
  selectedNodeId,
  onSelectNode,
}: DeliveryGraphProps) {
  const resultNodes = new Map(
    result?.graph.nodes.map((node) => [node.id, node]) ?? [],
  )
  const criticalIds = new Set(result?.graph.criticalPathIds ?? [])
  const blockerIds = new Set(result?.graph.highlightedBlockerIds ?? [])
  const excludedIds = new Set(result?.graph.excludedNodeIds ?? [])
  const delayById = new Map(
    result?.analytics.nodeMetrics.map((metric) => [
      metric.itemId,
      metric.expectedDelayHours,
    ]) ?? [],
  )
  const nodes: DeliveryGraphNode[] = project.workItems.map((item) => {
    const forecast = resultNodes.get(item.id) as
      Record<string, unknown> | undefined
    const delayHours = delayById.get(item.id) ?? 0
    return {
      id: item.id,
      type: 'delivery',
      width: 190,
      height: delayHours > 0 ? 90 : 72,
      position: {
        x: item.graphX ?? 120,
        y: item.graphY ?? 100,
      },
      data: {
        title: (forecast?.title as string | undefined) ?? item.title,
        kind: (forecast?.kind as string | undefined) ?? item.kind,
        status:
          (forecast?.status as
            DashboardProject['workItems'][number]['status'] | undefined) ??
          item.status,
        sourceReference: item.sourceReference,
        isCritical: criticalIds.has(item.id),
        isBlocker: blockerIds.has(item.id),
        isExcluded: excludedIds.has(item.id),
        isSelected: selectedNodeId === item.id,
        delayHours,
        onSelect: onSelectNode,
      },
    }
  })
  const pathEdges = criticalEdges(result?.graph.criticalPathIds ?? [])
  const sourceEdges = result?.graph.edges.length
    ? result.graph.edges
    : project.dependencies.map((edge) => ({
        source: edge.predecessorId,
        target: edge.successorId,
      }))
  const edges: Edge[] = sourceEdges.map((edge) => {
    const critical = pathEdges.has(`${edge.source}:${edge.target}`)
    return {
      id: `${edge.source}:${edge.target}`,
      source: edge.source,
      target: edge.target,
      animated: critical,
      style: {
        stroke: critical ? 'oklch(0.78 0.145 170)' : 'oklch(0.45 0.02 255)',
        strokeWidth: critical ? 2.5 : 1,
      },
    }
  })
  return { edges, nodes }
}

export function DeliveryGraph({
  project,
  result,
  selectedNodeId,
  onSelectNode,
}: DeliveryGraphProps) {
  const { nodes, edges } = useMemo(
    () =>
      buildGraphElements({
        project,
        result,
        selectedNodeId,
        onSelectNode,
      }),
    [onSelectNode, project, result, selectedNodeId],
  )
  return (
    <div
      className="h-full min-h-[480px] w-full"
      role="region"
      aria-label="Atlas delivery dependency graph"
    >
      <ReactFlow<DeliveryGraphNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.04}
        maxZoom={1.6}
        nodesFocusable
        edgesFocusable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="oklch(0.35 0.02 255)" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) =>
            node.data?.isCritical
              ? 'oklch(0.78 0.145 170)'
              : 'oklch(0.42 0.02 255)'
          }
          maskColor="oklch(0.12 0.01 255 / 0.72)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
