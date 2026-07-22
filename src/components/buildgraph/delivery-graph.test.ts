import { describe, expect, it } from 'vitest'

import { compactPosition } from '@/components/buildgraph/delivery-graph'

describe('compactPosition', () => {
  it('keeps the 42-node demo within a readable five-column viewport', () => {
    const positions = Array.from({ length: 42 }, (_, index) =>
      compactPosition(index),
    )

    expect(Math.max(...positions.map(({ x }) => x))).toBe(968)
    expect(Math.max(...positions.map(({ y }) => y))).toBe(1_056)
    expect(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size).toBe(42)
  })

  it('uses a serpentine order so sequential dependencies stay nearby', () => {
    expect(compactPosition(4)).toEqual({ x: 968, y: 48 })
    expect(compactPosition(5)).toEqual({ x: 968, y: 174 })
    expect(compactPosition(9)).toEqual({ x: 48, y: 174 })
    expect(compactPosition(10)).toEqual({ x: 48, y: 300 })
  })
})
