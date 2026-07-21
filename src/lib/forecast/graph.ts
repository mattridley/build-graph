import type {
  ForecastEdge,
  ForecastNode,
  ForecastScenario,
  ForecastScopeGroup,
} from '@/lib/forecast/types'

export class ForecastGraphError extends Error {
  constructor(
    public readonly code:
      | 'missing_node'
      | 'self_dependency'
      | 'cycle'
      | 'invalid_milestone'
      | 'invalid_scope_group',
    message: string,
  ) {
    super(message)
    this.name = 'ForecastGraphError'
  }
}

export class ForecastScenarioError extends Error {
  constructor(
    public readonly code:
      | 'unknown_scope_group'
      | 'core_scope_exclusion'
      | 'core_descendant_required'
      | 'unknown_blocker'
      | 'not_blocked',
    message: string,
  ) {
    super(message)
    this.name = 'ForecastScenarioError'
  }
}

function topologicalOrder(nodes: ForecastNode[], edges: ForecastEdge[]) {
  const order = new Map(nodes.map((node, index) => [node.id, index]))
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const successors = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) {
    indegree.set(edge.target, indegree.get(edge.target)! + 1)
    successors.get(edge.source)!.push(edge.target)
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0)
  const result: ForecastNode[] = []
  while (queue.length > 0) {
    queue.sort((left, right) => order.get(left.id)! - order.get(right.id)!)
    const node = queue.shift()!
    result.push(node)
    for (const successor of successors.get(node.id)!) {
      const next = indegree.get(successor)! - 1
      indegree.set(successor, next)
      if (next === 0) queue.push(nodes[order.get(successor)!]!)
    }
  }
  if (result.length !== nodes.length) {
    const cycleIds = nodes
      .filter((node) => !result.includes(node))
      .map((node) => node.id)
    throw new ForecastGraphError(
      'cycle',
      `Dependency graph contains a cycle involving: ${cycleIds.join(', ')}`,
    )
  }
  return result
}

function canReach(
  startId: string,
  targetId: string,
  successors: Map<string, string[]>,
) {
  const pending = [startId]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const current = pending.pop()!
    if (current === targetId) return true
    if (visited.has(current)) continue
    visited.add(current)
    pending.push(...(successors.get(current) ?? []))
  }
  return false
}

export function validateForecastGraph(
  nodes: ForecastNode[],
  edges: ForecastEdge[],
) {
  const nodeIds = new Set(nodes.map((node) => node.id))
  if (nodeIds.size !== nodes.length) {
    throw new ForecastGraphError(
      'missing_node',
      'Node identifiers must be unique',
    )
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new ForecastGraphError(
        'missing_node',
        `Dependency ${edge.source} -> ${edge.target} references a missing node`,
      )
    }
    if (edge.source === edge.target) {
      throw new ForecastGraphError(
        'self_dependency',
        `Node ${edge.source} cannot depend on itself`,
      )
    }
  }
  const ordered = topologicalOrder(nodes, edges)
  const milestones = nodes.filter((node) => node.kind === 'milestone')
  if (milestones.length !== 1) {
    throw new ForecastGraphError(
      'invalid_milestone',
      `Forecast graph requires exactly one release milestone; found ${milestones.length}`,
    )
  }
  const milestone = milestones[0]!
  if (edges.some((edge) => edge.source === milestone.id)) {
    throw new ForecastGraphError(
      'invalid_milestone',
      'The release milestone must be a terminal node',
    )
  }
  const successors = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) successors.get(edge.source)!.push(edge.target)
  const disconnected = nodes.filter(
    (node) => !canReach(node.id, milestone.id, successors),
  )
  if (disconnected.length > 0) {
    throw new ForecastGraphError(
      'invalid_milestone',
      `Nodes do not lead to the release milestone: ${disconnected.map((node) => node.id).join(', ')}`,
    )
  }
  return { ordered, milestoneId: milestone.id }
}

export function applyForecastScenario(
  nodes: ForecastNode[],
  edges: ForecastEdge[],
  scopeGroups: ForecastScopeGroup[],
  scenario: ForecastScenario,
) {
  const validated = validateForecastGraph(nodes, edges)
  const groups = new Map(scopeGroups.map((group) => [group.id, group]))
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    if (!node.scopeGroupId || !groups.has(node.scopeGroupId)) {
      throw new ForecastGraphError(
        'invalid_scope_group',
        `Node ${node.id} references missing scope group ${node.scopeGroupId ?? '(none)'}`,
      )
    }
  }
  const excludedGroups = new Set(scenario.excludedScopeGroupIds)
  for (const groupId of excludedGroups) {
    const group = groups.get(groupId)
    if (!group) {
      throw new ForecastScenarioError(
        'unknown_scope_group',
        `Scenario excludes unknown scope group ${groupId}`,
      )
    }
    if (group.classification !== 'optional') {
      throw new ForecastScenarioError(
        'core_scope_exclusion',
        `Scenario cannot exclude core scope group ${group.slug}`,
      )
    }
  }
  for (const blockerId of scenario.resolvedBlockerIds) {
    const blocker = nodeMap.get(blockerId)
    if (!blocker) {
      throw new ForecastScenarioError(
        'unknown_blocker',
        `Scenario resolves unknown blocker ${blockerId}`,
      )
    }
    if (blocker.status !== 'blocked') {
      throw new ForecastScenarioError(
        'not_blocked',
        `Scenario resolution ${blockerId} is not a blocked item`,
      )
    }
  }
  const excludedNodeIds = new Set(
    nodes
      .filter(
        (node) => node.scopeGroupId && excludedGroups.has(node.scopeGroupId),
      )
      .map((node) => node.id),
  )
  const successors = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) successors.get(edge.source)!.push(edge.target)
  for (const excludedId of excludedNodeIds) {
    const pending = [...(successors.get(excludedId) ?? [])]
    const visited = new Set<string>()
    while (pending.length > 0) {
      const descendantId = pending.pop()!
      if (visited.has(descendantId)) continue
      visited.add(descendantId)
      const descendant = nodeMap.get(descendantId)!
      const group = descendant.scopeGroupId
        ? groups.get(descendant.scopeGroupId)
        : undefined
      if (
        !excludedNodeIds.has(descendantId) &&
        descendant.kind !== 'milestone' &&
        group?.classification === 'core'
      ) {
        throw new ForecastScenarioError(
          'core_descendant_required',
          `Excluded item ${excludedId} is required by core descendant ${descendantId}`,
        )
      }
      pending.push(...(successors.get(descendantId) ?? []))
    }
  }
  const activeNodes = nodes.filter((node) => !excludedNodeIds.has(node.id))
  const activeEdges = edges.filter(
    (edge) =>
      !excludedNodeIds.has(edge.source) && !excludedNodeIds.has(edge.target),
  )
  const activeOrder = topologicalOrder(activeNodes, activeEdges)
  return {
    nodes: activeNodes,
    edges: activeEdges,
    ordered: activeOrder,
    milestoneId: validated.milestoneId,
    excludedNodeIds: [...excludedNodeIds],
    resolvedBlockerIds: new Set(scenario.resolvedBlockerIds),
  }
}
