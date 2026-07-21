import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'

import {
  DeliveryNode,
  type DeliveryGraphNode,
} from '@/components/buildgraph/delivery-node'

describe('DeliveryNode', () => {
  it('exposes selection, status, critical path, and delay without color alone', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ReactFlowProvider>
        <DeliveryNode
          {...({
            id: 'node-1',
            data: {
              title: 'Stabilise CI integration suite',
              kind: 'test',
              status: 'blocked',
              sourceReference: 'ATLAS-026',
              isCritical: true,
              isBlocker: true,
              isExcluded: false,
              isSelected: true,
              delayHours: 14.25,
              onSelect,
            },
          } as unknown as NodeProps<DeliveryGraphNode>)}
        />
      </ReactFlowProvider>,
    )

    const node = screen.getByRole('button', {
      name: 'Select Stabilise CI integration suite, blocked',
    })
    expect(node).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Critical path')).toBeInTheDocument()
    expect(screen.getByText('+14.3h expected delay')).toBeInTheDocument()
    await user.click(node)
    expect(onSelect).toHaveBeenCalledWith('node-1')
  })
})
