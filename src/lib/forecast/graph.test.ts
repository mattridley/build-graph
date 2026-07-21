import { describe, expect, it } from 'vitest'

import {
  applyForecastScenario,
  ForecastGraphError,
  ForecastScenarioError,
  validateForecastGraph,
} from '@/lib/forecast/graph'
import type {
  ForecastEdge,
  ForecastNode,
  ForecastScenario,
  ForecastScopeGroup,
} from '@/lib/forecast/types'

const groups: ForecastScopeGroup[] = [
  { id: 'core', slug: 'core', name: 'Core', classification: 'core' },
  {
    id: 'optional',
    slug: 'optional',
    name: 'Optional',
    classification: 'optional',
  },
]
const nodes: ForecastNode[] = [
  {
    id: 'core-task',
    scopeGroupId: 'core',
    kind: 'task',
    status: 'todo',
    title: 'Core',
    size: 'm',
    progressPercent: 0,
  },
  {
    id: 'optional-task',
    scopeGroupId: 'optional',
    kind: 'task',
    status: 'blocked',
    title: 'Optional',
    size: 's',
    progressPercent: 0,
  },
  {
    id: 'release',
    scopeGroupId: 'core',
    kind: 'milestone',
    status: 'todo',
    title: 'Release',
    size: 'xs',
    progressPercent: 0,
  },
]
const edges: ForecastEdge[] = [
  { source: 'core-task', target: 'release' },
  { source: 'optional-task', target: 'release' },
]
const scenario: ForecastScenario = {
  id: 'scenario',
  slug: 'optional-off',
  name: 'Optional off',
  excludedScopeGroupIds: ['optional'],
  resolvedBlockerIds: [],
}

describe('forecast graph and scenario validation', () => {
  it('orders a valid DAG and preserves excluded optional nodes', () => {
    expect(
      validateForecastGraph(nodes, edges).ordered.map((node) => node.id),
    ).toEqual(['core-task', 'optional-task', 'release'])
    const applied = applyForecastScenario(nodes, edges, groups, scenario)
    expect(applied.nodes.map((node) => node.id)).toEqual([
      'core-task',
      'release',
    ])
    expect(applied.excludedNodeIds).toEqual(['optional-task'])
  })

  it('rejects missing nodes, self dependencies, cycles, and invalid milestones', () => {
    expect(() =>
      validateForecastGraph(nodes, [
        ...edges,
        { source: 'missing', target: 'release' },
      ]),
    ).toThrowError(
      expect.objectContaining<Partial<ForecastGraphError>>({
        code: 'missing_node',
      }),
    )
    expect(() =>
      validateForecastGraph(nodes, [
        ...edges,
        { source: 'core-task', target: 'core-task' },
      ]),
    ).toThrowError(
      expect.objectContaining<Partial<ForecastGraphError>>({
        code: 'self_dependency',
      }),
    )
    expect(() =>
      validateForecastGraph(nodes, [
        ...edges,
        { source: 'release', target: 'core-task' },
      ]),
    ).toThrowError(
      expect.objectContaining<Partial<ForecastGraphError>>({ code: 'cycle' }),
    )
    expect(() =>
      validateForecastGraph(
        nodes.filter((node) => node.kind !== 'milestone'),
        [],
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ForecastGraphError>>({
        code: 'invalid_milestone',
      }),
    )
  })

  it('rejects core exclusions, unknown resolutions, and optional work required by core', () => {
    expect(() =>
      applyForecastScenario(nodes, edges, groups, {
        ...scenario,
        excludedScopeGroupIds: ['core'],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ForecastScenarioError>>({
        code: 'core_scope_exclusion',
      }),
    )
    expect(() =>
      applyForecastScenario(nodes, edges, groups, {
        ...scenario,
        excludedScopeGroupIds: [],
        resolvedBlockerIds: ['missing'],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ForecastScenarioError>>({
        code: 'unknown_blocker',
      }),
    )
    const dependentEdges = [
      { source: 'optional-task', target: 'core-task' },
      { source: 'core-task', target: 'release' },
    ]
    expect(() =>
      applyForecastScenario(nodes, dependentEdges, groups, scenario),
    ).toThrowError(
      expect.objectContaining<Partial<ForecastScenarioError>>({
        code: 'core_descendant_required',
      }),
    )
  })
})
