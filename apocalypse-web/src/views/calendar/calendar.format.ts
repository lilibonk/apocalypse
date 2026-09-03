import i18n from '@/i18n'

import type { DayFieldValue } from './calendar.api'

/** Display supplied lunar facts; never recalculate or alter the user's override. */
export function compactLunarText(
  value: DayFieldValue['lunarDate'] | undefined,
  language = 'zh',
): string {
  if (!value) return ''
  if (!language.startsWith('zh')) return `${value.leapMonth ? 'L ' : ''}${value.month}/${value.day}`
  if (value.day === 1)
    return `${value.leapMonth ? '闰' : ''}${['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'][value.month - 1] ?? value.month}月`
  if (value.day === 10) return '初十'
  if (value.day === 20) return '二十'
  if (value.day === 30) return '三十'
  return `${value.day < 10 ? '初' : value.day < 20 ? '十' : '廿'}${['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][value.day % 10]}`
}

export function calendarValueText(
  value: string | null | undefined,
  language = i18n.resolvedLanguage ?? i18n.language,
): string | null {
  if (!value) return null
  return i18n.getFixedT(language, 'calendar')(`values.${value}`, { defaultValue: value })
}

export function dayValueText(
  value: DayFieldValue | null | undefined,
  language = i18n.resolvedLanguage ?? i18n.language,
): string {
  if (!value) return '—'
  const t = i18n.getFixedT(language, 'calendar')
  if (value.state === 'CLEARED') return t('fieldStates.CLEARED')
  if (value.state === 'UNPUBLISHED') return t('fieldStates.UNPUBLISHED')
  if (value.lunarDate)
    return t(value.lunarDate.leapMonth ? 'lunarLeapValue' : 'lunarValue', value.lunarDate)
  return (
    value.text ??
    calendarValueText(value.dayPolicy?.name, language) ??
    calendarValueText(value.dayPolicy?.classification, language) ??
    calendarValueText(value.solarTerm, language) ??
    calendarValueText(value.zodiac, language) ??
    '—'
  )
}

export function toErrorMessage(
  error: unknown,
  language = i18n.resolvedLanguage ?? i18n.language,
): string {
  return error instanceof Error
    ? error.message
    : i18n.getFixedT(language, 'calendar')('operationFailed')
}
