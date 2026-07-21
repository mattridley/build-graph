import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Home from '@/app/page'

vi.mock('@/components/buildgraph/dashboard', () => ({
  BuildGraphDashboard: ({ project }: { project: { workItems: unknown[] } }) => (
    <main>
      <h1>Atlas release graph</h1>
      <p>SYNTHETIC DEMO</p>
      <p>{project.workItems.length} nodes</p>
    </main>
  ),
}))

describe('home page', () => {
  it('renders the deliberate BuildGraph application shell', () => {
    render(<Home />)

    expect(
      screen.getByRole('heading', { name: 'Atlas release graph' }),
    ).toBeInTheDocument()
    expect(screen.getByText('SYNTHETIC DEMO')).toBeInTheDocument()
    expect(screen.getByText('42 nodes')).toBeInTheDocument()
  })
})
