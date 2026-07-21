import { describe, expect, it } from 'vitest'

import {
  addLondonBusinessHours,
  londonDate,
  normalizeToBusinessTime,
} from '@/lib/forecast/calendar'

describe('Europe/London business calendar', () => {
  it('carries work across evenings and weekends in summer time', () => {
    expect(
      addLondonBusinessHours('2026-07-24T15:00:00.000Z', 2).toISOString(),
    ).toBe('2026-07-27T09:00:00.000Z')
    expect(
      normalizeToBusinessTime('2026-07-25T12:00:00.000Z').toISOString(),
    ).toBe('2026-07-27T08:00:00.000Z')
  })

  it('uses GMT in winter and preserves stable local dates', () => {
    expect(
      normalizeToBusinessTime('2026-01-05T07:00:00.000Z').toISOString(),
    ).toBe('2026-01-05T09:00:00.000Z')
    expect(londonDate('2026-07-31T23:30:00.000Z')).toBe('2026-08-01')
  })
})
