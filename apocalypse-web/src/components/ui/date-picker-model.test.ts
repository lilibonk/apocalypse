import { describe, expect, it } from 'vitest'
import { dateCells, moveDate, moveMonth, validDate } from './date-picker-model'

describe('local calendar date selection', () => {
  it.each(['2024-02-29', '1901-01-01', '0001-01-01', '9999-12-31'])(
    'accepts %s without a time-zone conversion',
    (date) => expect(validDate(date)).toBe(true),
  )
  it.each(['2026-02-29', '2026-13-01', '2026-04-31', '0000-01-01', '', '2026-1-1'])(
    'rejects %s instead of normalizing an invalid day',
    (date) => expect(validDate(date)).toBe(false),
  )
  it('moves across leap years, months and years', () => {
    expect(moveDate('2024-02-28', 1)).toBe('2024-02-29')
    expect(moveDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(moveMonth('2024-01-31', 1)).toBe('2024-02-29')
    expect(moveMonth('2024-02-29', 12)).toBe('2025-02-28')
    expect(moveMonth('2026-01-31', -1)).toBe('2025-12-31')
  })
  it('does not move beyond supported ISO years', () => {
    expect(moveDate('0001-01-01', -1)).toBe('0001-01-01')
    expect(moveDate('9999-12-31', 1)).toBe('9999-12-31')
    expect(moveMonth('9999-12-31', 1)).toBe('9999-12-31')
  })
  it('builds complete weeks with no duplicate or phantom dates', () => {
    for (const month of ['2026-02', '2024-02', '2026-08', '0001-01', '9999-12']) {
      const weeks = dateCells(month)
      const dates = weeks.flat().filter((day): day is string => !!day)
      expect(weeks.every((week) => week.length === 7)).toBe(true)
      expect(new Set(dates).size).toBe(dates.length)
      expect(dates.every(validDate)).toBe(true)
    }
    expect(dateCells('2024-02').flat().filter(Boolean)).toHaveLength(29)
    expect(dateCells('2026-08')).toHaveLength(6)
    expect(dateCells('2026-13')).toEqual([])
  })
})
