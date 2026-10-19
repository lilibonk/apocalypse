import { describe, expect, it } from 'vitest'

import {
  bucketCounts,
  bucketLabel,
  operationTypeKey,
  periodComparison,
  retainedTotal,
  serverTimeCoordinate,
  trendGeometry,
  trendPath,
} from './dashboard-insights.model'

describe('dashboard range model', () => {
  it('uses naive server calendar coordinates without browser timezone conversion', () => {
    expect(serverTimeCoordinate('2026-10-18 23:59:59')).toBe(Date.UTC(2026, 9, 18, 23, 59, 59))
    expect(serverTimeCoordinate('2026-02-30 10:00:00')).toBeNull()
    expect(serverTimeCoordinate('not a time')).toBeNull()
  })

  it('labels hour and day buckets in the recording zone as received', () => {
    expect(bucketLabel('2026-10-18 09:00:00', 'HOURS')).toBe('09:00')
    expect(bucketLabel('2026-10-18 00:00:00', 'DAYS')).toBe('10-18')
  })

  it('compares only against a fully retained previous window', () => {
    expect(periodComparison(150, 100, true)).toEqual({
      percent: 50,
      multiple: null,
      direction: 'up',
    })
    expect(periodComparison(75, 100, true)).toEqual({
      percent: 25,
      multiple: null,
      direction: 'down',
    })
    expect(periodComparison(100, 100, true)).toEqual({
      percent: 0,
      multiple: null,
      direction: 'same',
    })
    expect(periodComparison(10, 0, true)).toEqual({
      percent: null,
      multiple: null,
      direction: 'up',
    })
    expect(periodComparison(0, 0, true)).toEqual({
      percent: null,
      multiple: null,
      direction: 'same',
    })
    expect(periodComparison(10, 0, false)).toEqual({
      percent: null,
      multiple: null,
      direction: null,
    })
  })

  it('switches large increases to a multiple instead of a four-digit percentage', () => {
    expect(periodComparison(199, 100, true)).toEqual({
      percent: 99,
      multiple: null,
      direction: 'up',
    })
    expect(periodComparison(200, 100, true)).toEqual({
      percent: null,
      multiple: 2,
      direction: 'up',
    })
    expect(periodComparison(46, 4, true)).toEqual({ percent: null, multiple: 12, direction: 'up' })
    expect(periodComparison(23, 4, true)).toEqual({ percent: null, multiple: 5.8, direction: 'up' })
    // Decreases are bounded by −100% and stay percentages.
    expect(periodComparison(4, 57, true)).toEqual({
      percent: 93,
      multiple: null,
      direction: 'down',
    })
  })

  it('generates finite paths through every observed bucket without overshoot', () => {
    const shape = trendPath([0, 5, 2])
    expect(shape?.path).not.toMatch(/NaN|Infinity/)
    expect(shape?.points).toHaveLength(3)
    expect(shape?.points[1].y).toBe(trendGeometry.top)
    expect(Math.max(...(shape?.points.map((point) => point.y) ?? []))).toBeLessThanOrEqual(
      trendGeometry.bottom,
    )
    expect(trendPath([])).toBeNull()
    expect(trendPath([3])?.points[0].x).toBe(trendGeometry.width / 2)
  })

  it('reads zero-filled bucket totals in order', () => {
    expect(
      bucketCounts([
        { start: 'a', total: 0, succeeded: 0, failed: 0 },
        { start: 'b', total: 4, succeeded: 3, failed: 1 },
      ]),
    ).toEqual([0, 4])
  })

  it('keeps raw business values for unknown operation types and rejects invalid totals', () => {
    expect(operationTypeKey('GRANT')).toBe('typeGrant')
    expect(operationTypeKey(null)).toBe('typeUnknown')
    expect(operationTypeKey('CUSTOM')).toBeNull()
    expect(retainedTotal(-1)).toBeNull()
    expect(retainedTotal(12)).toBe(12)
  })
})
