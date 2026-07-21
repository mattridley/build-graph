import { describe, expect, it } from 'vitest'

import { atlasFixtureDigest, buildAtlasFixture } from '@/lib/demo/atlas'
import { findCycle } from '@/lib/postgres/graph'

describe('Atlas fixture', () => {
  it('is byte-stable and uses stable deterministic identifiers', () => {
    expect(JSON.stringify(buildAtlasFixture())).toBe(
      JSON.stringify(buildAtlasFixture()),
    )
    expect(atlasFixtureDigest()).toBe(
      '7fccaa34b29d7724b7d315dac670a7252698965f878accd8aeda9f69b616a8b1',
    )
  })

  it('contains the contracted acyclic graph and independent scenarios', () => {
    const fixture = buildAtlasFixture()
    expect(fixture.workItems).toHaveLength(42)
    expect(fixture.dependencies).toHaveLength(52)
    expect(
      fixture.workItems.filter((item) => item.kind === 'milestone'),
    ).toHaveLength(1)
    expect(
      findCycle(
        fixture.workItems.map((item) => item.id),
        fixture.dependencies,
      ),
    ).toBeUndefined()
    expect(
      fixture.scopeGroups
        .filter((group) => group.classification === 'optional')
        .map((group) => group.slug),
    ).toEqual(['audit-export', 'mobile-alerts', 'regional-reports'])
    expect(fixture.scenarios.map((scenario) => scenario.slug)).toEqual([
      'baseline',
      'defer-audit-export',
      'resolve-ci-instability',
    ])
    const knownIds = new Set(fixture.workItems.map((item) => item.id))
    expect(
      fixture.scenarios
        .flatMap((scenario) => scenario.resolvedBlockerIds)
        .every((id) => knownIds.has(id)),
    ).toBe(true)
  })

  it('makes the calibrated story landmarks explicit', () => {
    const fixture = buildAtlasFixture()
    expect(
      fixture.workItems.find(
        (item) => item.id === fixture.landmarks.ciBlockerId,
      )?.status,
    ).toBe('blocked')
    expect(
      fixture.workItems.find(
        (item) => item.id === fixture.landmarks.urgentNonCriticalId,
      )?.scopeGroupId,
    ).toBe(
      fixture.scopeGroups.find((group) => group.slug === 'mobile-alerts')?.id,
    )
    expect(fixture.evidenceExamples).toHaveLength(3)
    expect(fixture.calibration.baseline.expected).toBeGreaterThanOrEqual(0.35)
    expect(fixture.calibration.baseline.expected).toBeLessThanOrEqual(0.5)
    expect(
      fixture.calibration.deferAuditExport.expected,
    ).toBeGreaterThanOrEqual(0.78)
    expect(fixture.calibration.deferAuditExport.expected).toBeLessThanOrEqual(
      0.85,
    )
  })
})
