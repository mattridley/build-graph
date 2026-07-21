import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InvestigationArtifact } from '@/components/buildgraph/investigation-artifact'
import type { BuildGraphDataParts } from '@/lib/ai/contracts'

const hookState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}))

vi.mock('@trigger.dev/react-hooks', () => ({
  useRealtimeRun: () => hookState.value,
}))

const data: BuildGraphDataParts['investigation'] = {
  investigationId: '77777777-7777-4777-8777-777777777777',
  runId: 'run-atlas-1',
  publicAccessToken: 'public-read-token',
}

function renderArtifact(
  overrides: Partial<ComponentProps<typeof InvestigationArtifact>> = {},
) {
  const props = {
    data,
    active: true,
    onActivate: vi.fn(),
    onResult: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  }
  return { ...render(<InvestigationArtifact {...props} />), props }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InvestigationArtifact', () => {
  it('renders validated live stage and shard progress', () => {
    hookState.value = {
      run: {
        metadata: {
          stage: 'simulating',
          percentage: 48,
          completedShards: 12,
          totalShards: 25,
          scenarioLabel: 'Baseline',
          projectId: '88888888-8888-4888-8888-888888888888',
          investigationId: data.investigationId,
          seed: 84217,
        },
      },
      error: null,
    }
    renderArtifact()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '48',
    )
    expect(screen.getByText('12/25 shards')).toBeInTheDocument()
    expect(screen.getByText('Baseline')).toBeInTheDocument()
  })

  it('normalizes connection errors and retries with a fresh scoped token', async () => {
    const user = userEvent.setup()
    hookState.value = {
      run: undefined,
      error: new Error('secret provider detail'),
    }
    const nextData = {
      ...data,
      runId: 'run-atlas-2',
      publicAccessToken: 'fresh-token',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(nextData), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    const { props } = renderArtifact()
    expect(screen.getByText(/live token expired/)).toBeInTheDocument()
    expect(screen.queryByText(/secret provider detail/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry forecast' }))
    expect(fetch).toHaveBeenCalledWith(
      `/api/investigations/${data.investigationId}/retry`,
      { method: 'POST' },
    )
    expect(props.onRetry).toHaveBeenCalledWith(nextData)
  })
})
