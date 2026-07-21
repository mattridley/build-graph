import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ForecastPanel } from '@/components/buildgraph/forecast-panel'
import type { DashboardProject } from '@/components/buildgraph/types'

const project: DashboardProject = {
  project: {
    id: 'project',
    slug: 'atlas',
    name: 'Atlas',
    description: 'Synthetic',
    timezone: 'Europe/London',
    targetDate: '2026-08-28',
  },
  scopeGroups: [],
  dependencies: [],
  workItems: [
    {
      id: 'node-1',
      scopeGroupId: null,
      kind: 'test',
      status: 'blocked',
      title: 'Stabilise CI integration suite',
      description: 'Synthetic blocker',
      size: 'm',
      progressPercent: 62,
      sourceReference: 'ATLAS-026',
      graphX: 10,
      graphY: 10,
    },
  ],
  scenarios: [
    {
      id: 'baseline',
      slug: 'baseline',
      name: 'Baseline',
      description: 'Current scope',
      excludedScopeGroupIds: [],
      resolvedBlockerIds: [],
    },
    {
      id: 'defer-audit',
      slug: 'defer-audit-export',
      name: 'Defer audit export',
      description: 'Move audit export',
      excludedScopeGroupIds: ['audit'],
      resolvedBlockerIds: [],
    },
  ],
}

describe('ForecastPanel', () => {
  it('shows preview confidence, selected-node evidence, and starts a scenario', async () => {
    const user = userEvent.setup()
    const onScenarioSelect = vi.fn()
    render(
      <ForecastPanel
        project={project}
        result={null}
        selectedNodeId="node-1"
        scenarioLoading={null}
        onScenarioSelect={onScenarioSelect}
      />,
    )

    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(
      screen.getByText('Stabilise CI integration suite'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Defer audit export/ }))
    expect(onScenarioSelect).toHaveBeenCalledWith('defer-audit')
  })
})
