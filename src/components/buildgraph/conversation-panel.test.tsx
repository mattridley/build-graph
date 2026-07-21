import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'

import {
  ConversationPanel,
  examplePrompts,
} from '@/components/buildgraph/conversation-panel'
import type { BuildGraphUIMessage } from '@/lib/ai/contracts'

function renderPanel(
  messages: BuildGraphUIMessage[] = [],
  status: 'ready' | 'submitted' | 'streaming' | 'error' = 'ready',
) {
  const props = {
    messages,
    status,
    apiKey: '',
    activeInvestigationId: null,
    onApiKeyChange: vi.fn(),
    onSubmit: vi.fn(),
    onSuggestion: vi.fn(),
    onActivateInvestigation: vi.fn(),
    onResult: vi.fn(),
    onRetry: vi.fn(),
    onStop: vi.fn(),
  }
  return { ...render(<ConversationPanel {...props} />), props }
}

describe('ConversationPanel', () => {
  it('renders four usable example prompts and requires a user-owned key', async () => {
    const user = userEvent.setup()
    const { props } = renderPanel()

    for (const prompt of examplePrompts) {
      expect(screen.getByRole('button', { name: prompt })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: examplePrompts[0] }))
    expect(props.onSuggestion).toHaveBeenCalledWith(examplePrompts[0])
    expect(
      screen.getByRole('button', { name: 'Submit delivery question' }),
    ).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Your Vercel AI Gateway key'), {
      target: { value: 'user-key' },
    })
    expect(props.onApiKeyChange).toHaveBeenCalledWith('user-key')
    expect(screen.getByText(/Kept in memory; never saved/)).toBeInTheDocument()
  })

  it('disables only the current message input while streaming', () => {
    renderPanel([], 'streaming')
    expect(screen.getByLabelText('Delivery question')).toBeDisabled()
  })

  it('renders normalized errors without exposing internals', () => {
    const messages: BuildGraphUIMessage[] = [
      {
        id: 'safe-error',
        role: 'assistant',
        parts: [
          {
            type: 'data-error',
            data: {
              code: 'forecast_unavailable',
              detail: 'The forecast service is temporarily unavailable.',
            },
          },
        ],
      },
    ]
    renderPanel(messages)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The forecast service is temporarily unavailable.',
    )
  })

  it('has no automatically detectable accessibility violations', async () => {
    const { container } = renderPanel()
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
