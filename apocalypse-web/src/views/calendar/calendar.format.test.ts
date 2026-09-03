import { describe, expect, it } from 'vitest'

import type { DayFieldValue } from './calendar.api'
import { calendarValueText, dayValueText, toErrorMessage } from './calendar.format'

function fieldValue(state: DayFieldValue['state']): DayFieldValue {
  return {
    field: 'DISPLAY_LABEL',
    lunarDate: null,
    zodiac: null,
    solarTerm: null,
    dayPolicy: null,
    text: null,
    state,
  }
}

describe('calendar display localization', () => {
  it('localizes stable solar-term and policy codes in both supported languages', () => {
    expect(calendarValueText('START_OF_AUTUMN', 'zh')).toBe('立秋')
    expect(calendarValueText('START_OF_AUTUMN', 'en')).toBe('Start of Autumn')
    expect(calendarValueText('ADJUSTED_WORKDAY', 'zh')).toBe('调休工作日')
    expect(calendarValueText('ADJUSTED_WORKDAY', 'en')).toBe('Adjusted workday')
    expect(calendarValueText('DRAGON', 'zh')).toBe('龙')
    expect(calendarValueText('DRAGON', 'en')).toBe('Dragon')
  })

  it('localizes audited holiday labels and preserves user-defined labels', () => {
    expect(calendarValueText('春节调休上班', 'en')).toBe('Spring Festival adjusted workday')
    expect(calendarValueText('校庆排课日', 'en')).toBe('校庆排课日')
    expect(calendarValueText(null, 'en')).toBeNull()
  })

  it('translates field sentinel states without changing backend text', () => {
    expect(dayValueText(fieldValue('CLEARED'), 'zh')).toBe('未设置或已清空')
    expect(dayValueText(fieldValue('CLEARED'), 'en')).toBe('Absent / cleared')
    expect(dayValueText(fieldValue('UNPUBLISHED'), 'en')).toBe('Unpublished')
  })

  it('localizes only the frontend fallback error', () => {
    expect(toErrorMessage(null, 'en')).toBe('Operation failed')
    expect(toErrorMessage(new Error('后端业务错误'), 'en')).toBe('后端业务错误')
  })
})
