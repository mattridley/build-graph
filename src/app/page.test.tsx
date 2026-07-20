import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Home from '@/app/page'

describe('home page', () => {
  it('renders the deliberate BuildGraph application shell', () => {
    render(<Home />)

    expect(
      screen.getByRole('heading', {
        name: 'Delivery risk, mapped and explained.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Atlas release graph')).toBeInTheDocument()
    expect(screen.getByText('SYNTHETIC DEMO')).toBeInTheDocument()
  })
})
