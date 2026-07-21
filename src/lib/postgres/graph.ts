export interface DirectedEdge {
  predecessorId: string
  successorId: string
}

export class GraphCycleError extends Error {
  constructor(public readonly cycleNodeIds: string[]) {
    super(`Dependency would create a cycle: ${cycleNodeIds.join(' -> ')}`)
    this.name = 'GraphCycleError'
  }
}

export function findCycle(nodeIds: Iterable<string>, edges: DirectedEdge[]) {
  const adjacency = new Map<string, string[]>()
  for (const nodeId of nodeIds) adjacency.set(nodeId, [])
  for (const edge of edges) {
    const successors = adjacency.get(edge.predecessorId) ?? []
    successors.push(edge.successorId)
    adjacency.set(edge.predecessorId, successors)
    if (!adjacency.has(edge.successorId)) adjacency.set(edge.successorId, [])
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const path: string[] = []

  const visit = (nodeId: string): string[] | undefined => {
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId)
      return [...path.slice(cycleStart), nodeId]
    }
    if (visited.has(nodeId)) return undefined

    visiting.add(nodeId)
    path.push(nodeId)
    for (const successorId of adjacency.get(nodeId) ?? []) {
      const cycle = visit(successorId)
      if (cycle) return cycle
    }
    path.pop()
    visiting.delete(nodeId)
    visited.add(nodeId)
    return undefined
  }

  for (const nodeId of adjacency.keys()) {
    const cycle = visit(nodeId)
    if (cycle) return cycle
  }
  return undefined
}

export function assertAcyclic(
  nodeIds: Iterable<string>,
  edges: DirectedEdge[],
) {
  const cycle = findCycle(nodeIds, edges)
  if (cycle) throw new GraphCycleError(cycle)
}
