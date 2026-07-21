import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  buildSmallDemoHistoryFixture,
  generateCiRunChunks,
  generateDeliveryEventChunks,
  historyManifest,
  SMALL_DEMO_HISTORY_CONFIG,
} from '@/lib/demo/history'

describe('synthetic history generator', () => {
  it('is deterministic across chunk boundaries without materializing the large corpus', () => {
    const first = buildSmallDemoHistoryFixture().deliveryChunks
    const second = buildSmallDemoHistoryFixture().deliveryChunks
    expect(first).toEqual(second)
    expect(first.flatMap((chunk) => chunk.rows)).toHaveLength(96)
    expect(
      first.every(
        (chunk) => chunk.rows.length <= SMALL_DEMO_HISTORY_CONFIG.chunkSize,
      ),
    ).toBe(true)
    expect(new Set(first.map((chunk) => chunk.token)).size).toBe(first.length)
    const digest = createHash('sha256')
      .update(JSON.stringify(first))
      .digest('hex')
    expect(digest).toBe(
      '9e35a87a151d6782e3b0092a4efb6d4e26cb87cbeeb3925d28daaf4fb936dfd0',
    )
    expect(historyManifest(SMALL_DEMO_HISTORY_CONFIG)).toEqual(
      historyManifest(SMALL_DEMO_HISTORY_CONFIG),
    )
  })

  it('streams the contracted large corpus in bounded chunks', () => {
    let deliveryEvents = 0
    let deliveryChunks = 0
    for (const chunk of generateDeliveryEventChunks()) {
      deliveryEvents += chunk.rows.length
      deliveryChunks++
      expect(chunk.rows.length).toBeLessThanOrEqual(2_000)
    }
    let ciRuns = 0
    let ciChunks = 0
    for (const chunk of generateCiRunChunks()) {
      ciRuns += chunk.rows.length
      ciChunks++
      expect(chunk.rows.length).toBeLessThanOrEqual(2_000)
    }
    expect({ deliveryEvents, deliveryChunks, ciRuns, ciChunks }).toEqual({
      deliveryEvents: 250_000,
      deliveryChunks: 125,
      ciRuns: 50_000,
      ciChunks: 25,
    })
  }, 30_000)

  it('emits valid shaped delivery transitions during London business hours', () => {
    const rows = [
      ...generateDeliveryEventChunks(SMALL_DEMO_HISTORY_CONFIG),
    ].flatMap((chunk) => chunk.rows)
    const expected = [
      'created',
      'started',
      'blocked',
      'blocked_duration',
      'unblocked',
      'review',
      'rework',
      'completed',
    ]
    for (let offset = 0; offset < rows.length; offset += expected.length) {
      expect(
        rows
          .slice(offset, offset + expected.length)
          .map((row) => row.event_kind),
      ).toEqual(expected)
    }
    for (const row of rows) {
      const date = new Date(row.occurred_at)
      expect(date.getUTCDay()).toBeGreaterThanOrEqual(1)
      expect(date.getUTCDay()).toBeLessThanOrEqual(5)
      expect(date.getUTCHours()).toBeGreaterThanOrEqual(9)
      expect(date.getUTCHours()).toBeLessThan(17)
      if (row.duration_hours !== null)
        expect(row.duration_hours).toBeGreaterThan(0)
    }
    expect(new Set(rows.map((row) => row.item_kind)).size).toBeGreaterThan(2)
    expect(
      new Set(
        rows.map((row) => row.duration_hours).filter((value) => value !== null),
      ).size,
    ).toBeGreaterThan(5)
  })

  it('shapes workflow-specific failure, retry, and duration distributions', () => {
    const rows = [
      ...generateCiRunChunks({ ...SMALL_DEMO_HISTORY_CONFIG, ciRunCount: 480 }),
    ].flatMap((chunk) => chunk.rows)
    const byWorkflow = Map.groupBy(rows, (row) => row.workflow)
    expect([...byWorkflow.keys()].sort()).toEqual([
      'browser',
      'integration',
      'security',
      'unit',
    ])
    const rate = (workflow: string) => {
      const values = byWorkflow.get(workflow)!
      return (
        values.filter((row) => row.conclusion === 'success').length /
        values.length
      )
    }
    expect(rate('integration')).toBeLessThan(rate('unit'))
    expect(rate('browser')).toBeLessThan(rate('security'))
    expect(rows.some((row) => row.retry_count > 0)).toBe(true)
    expect(
      new Set(rows.map((row) => row.duration_seconds)).size,
    ).toBeGreaterThan(20)
    expect(
      rows.every(
        (row) => new Date(row.completed_at) > new Date(row.started_at),
      ),
    ).toBe(true)
  })
})
