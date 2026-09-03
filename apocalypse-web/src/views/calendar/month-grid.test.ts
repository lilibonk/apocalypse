import { describe, expect, it } from 'vitest'

import { monthCells, monthRange, shiftMonth } from './month-grid'

describe('calendar month grid', () => {
  it('保留周日起始空位并覆盖闰年二月', () => {
    const cells = monthCells('2028-02')

    expect(cells.filter(Boolean)).toHaveLength(29)
    expect(cells.find((cell) => cell?.day === 29)?.isoDate).toBe('2028-02-29')
  })

  it('跨年切换月份且给出闭区间', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})
