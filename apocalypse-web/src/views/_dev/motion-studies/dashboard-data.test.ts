import { describe, expect, it } from 'vitest'
import {
  dashboardChart,
  dashboardRanges,
  dashboardSnapshots,
  loginBucketLabel,
} from './dashboard-data'

describe('dashboard demonstration data', () => {
  it('keeps overlapping periods consistent and accounts for every operation', () => {
    const day = dashboardSnapshots['24h'].logins.reduce((sum, value) => sum + value, 0)
    expect(dashboardSnapshots['7d'].logins.at(-1)).toBe(day)
    expect(dashboardSnapshots['30d'].logins.slice(-7)).toEqual(dashboardSnapshots['7d'].logins)
    for (const range of dashboardRanges) {
      const snapshot = dashboardSnapshots[range]
      expect(snapshot.distribution.reduce((sum, value) => sum + value, 0)).toBe(snapshot.operations)
      expect(snapshot.failedOperations).toBeGreaterThanOrEqual(0)
      expect(snapshot.failedOperations).toBeLessThan(snapshot.operations)
    }
  })

  it('preserves a compatible finite chart shape when changing reporting periods', () => {
    const charts = dashboardRanges.map((range) => dashboardChart(dashboardSnapshots[range].logins))
    const commands = charts.map(({ path }) => path.match(/[A-Z]/g))
    expect(commands[0]).toEqual(commands[1])
    expect(commands[1]).toEqual(commands[2])
    for (const chart of charts) {
      expect(chart.path).not.toMatch(/NaN|Infinity/)
      expect(chart.ceiling).toBeGreaterThan(0)
      expect(chart.end.x).toBeGreaterThan(0)
    }
  })

  it('labels month boundaries and the final observation without timezone conversion', () => {
    expect(loginBucketLabel('30d', 0, 'en')).toBe('9/19')
    expect(loginBucketLabel('30d', 12, 'en')).toBe('10/1')
    expect(loginBucketLabel('30d', 29, 'en')).toBe('10/18')
    expect(loginBucketLabel('7d', 0, 'zh')).toBe('10 月 12 日')
    expect(loginBucketLabel('24h', 23, 'en')).toBe('23:00')
  })
})
