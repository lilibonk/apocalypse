import i18n from '@/i18n'

import type { DayFieldValue } from './calendar.api'

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
