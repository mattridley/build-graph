import { describe, expect, it } from 'vitest'

import { assertAcyclic, findCycle, GraphCycleError } from '@/lib/postgres/graph'

describe('dependency graph validation', () => {
  it('accepts a directed acyclic graph', () => {
    expect(
      findCycle(
        ['a', 'b', 'c'],
        [
          { predecessorId: 'a', successorId: 'b' },
          { predecessorId: 'b', successorId: 'c' },
        ],
      ),
    ).toBeUndefined()
  })

  it('returns the path for a transitive cycle', () => {
    expect(
      findCycle(
        ['a', 'b', 'c'],
        [
          { predecessorId: 'a', successorId: 'b' },
          { predecessorId: 'b', successorId: 'c' },
          { predecessorId: 'c', successorId: 'a' },
        ],
      ),
    ).toEqual(['a', 'b', 'c', 'a'])
  })

  it('rejects self dependencies', () => {
    expect(() =>
      assertAcyclic(['a'], [{ predecessorId: 'a', successorId: 'a' }]),
    ).toThrow(GraphCycleError)
  })
})
