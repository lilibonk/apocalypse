import { describe, expect, it } from 'vitest'

import {
  buildLoginStreamQuery,
  computeBucketWindow,
  failureConcentrated,
  hasActiveCausalFilter,
  heatLevel,
  heatmapRows,
  moveCell,
} from './login-heatmap.model'

describe('login heatmap model', () => {
  it('keeps recorded zero distinct and scales the busiest cell to the top level', () => {
    expect(heatLevel(0, 10)).toBe(0)
    expect(heatLevel(1, 10)).toBe(1)
    expect(heatLevel(10, 10)).toBe(4)
    expect(heatLevel(6, 10)).toBe(3)
    expect(heatLevel(3, 0)).toBe(0)
  })

  it('flags failure concentration only above both thresholds', () => {
    expect(failureConcentrated({ total: 10, failed: 3 })).toBe(true)
    expect(failureConcentrated({ total: 20, failed: 3 })).toBe(false)
    expect(failureConcentrated({ total: 2, failed: 2 })).toBe(false)
  })

  it('fills a complete 7×24 matrix and marks missing cells uncovered', () => {
    const rows = heatmapRows([{ isoWeekday: 3, hour: 14, total: 5, failed: 1, slots: 1 }])
    expect(rows).toHaveLength(7)
    expect(rows.every((row) => row.length === 24)).toBe(true)
    expect(rows[2][14].total).toBe(5)
    expect(rows[0][0].slots).toBe(0)
  })

  it('moves focus within bounds', () => {
    expect(moveCell({ row: 0, column: 0 }, 'ArrowUp')).toEqual({ row: 0, column: 0 })
    expect(moveCell({ row: 6, column: 23 }, 'ArrowRight')).toEqual({ row: 6, column: 23 })
    expect(moveCell({ row: 2, column: 5 }, 'End')).toEqual({ row: 2, column: 23 })
    expect(moveCell({ row: 2, column: 5 }, 'x')).toBeNull()
  })

  it('builds causal drilldown queries for heatmap cells, trend buckets, and failure status', () => {
    expect(hasActiveCausalFilter({ range: 'WEEK' })).toBe(false)
    const cellQuery = buildLoginStreamQuery('admin', {
      range: 'WEEK',
      cell: { isoWeekday: 3, hour: 14 },
      success: 0,
    })
    expect(cellQuery).toEqual({
      keyword: 'admin',
      success: 0,
      isoWeekday: 3,
      hour: 14,
      range: 'WEEK',
      bucketFrom: undefined,
      bucketTo: undefined,
    })

    const window = computeBucketWindow('2026-10-18 14:00:00', '2026-10-18 15:00:00')
    expect(window).toEqual({
      bucketFrom: '2026-10-18T14:00:00',
      bucketTo: '2026-10-18T15:00:00',
    })
  })
})
