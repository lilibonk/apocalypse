import type {
  DayField,
  DayFieldValue,
  DaySnapshot,
  EffectiveDay,
  OverrideAction,
} from './calendar.api'

export const dayFieldLabels: Record<DayField, string> = {
  LUNAR_DATE: 'lunarDate',
  ZODIAC: 'zodiac',
  SOLAR_TERM: 'solarTerm',
  DAY_POLICY: 'dayPolicy',
  DISPLAY_LABEL: 'displayLabel',
  DISPLAY_NOTE: 'displayNote',
}
export const zodiacs = [
  'RAT',
  'OX',
  'TIGER',
  'RABBIT',
  'DRAGON',
  'SNAKE',
  'HORSE',
  'GOAT',
  'MONKEY',
  'ROOSTER',
  'DOG',
  'PIG',
] as const
export const solarTerms = [
  'MINOR_COLD',
  'MAJOR_COLD',
  'START_OF_SPRING',
  'RAIN_WATER',
  'AWAKENING_OF_INSECTS',
  'SPRING_EQUINOX',
  'PURE_BRIGHTNESS',
  'GRAIN_RAIN',
  'START_OF_SUMMER',
  'GRAIN_FULL',
  'GRAIN_IN_EAR',
  'SUMMER_SOLSTICE',
  'MINOR_HEAT',
  'MAJOR_HEAT',
  'START_OF_AUTUMN',
  'END_OF_HEAT',
  'WHITE_DEW',
  'AUTUMN_EQUINOX',
  'COLD_DEW',
  'FROST_DESCENT',
  'START_OF_WINTER',
  'MINOR_SNOW',
  'MAJOR_SNOW',
  'WINTER_SOLSTICE',
] as const
export const dayPolicies = [
  'NORMAL_WORKDAY',
  'WEEKEND_REST',
  'OFFICIAL_REST',
  'ADJUSTED_WORKDAY',
  'CUSTOM_WORKDAY',
  'CUSTOM_REST',
] as const

export type DayOverrideCommand =
  | { field: DayField; action: 'CLEAR' | 'INHERIT' }
  | { field: 'DISPLAY_LABEL' | 'DISPLAY_NOTE'; action: 'SET'; value: { text: string } }
  | {
      field: 'LUNAR_DATE'
      action: 'SET'
      value: { lunarDate: { year: number; month: number; day: number; leapMonth: boolean } }
    }
  | { field: 'ZODIAC'; action: 'SET'; value: { zodiac: (typeof zodiacs)[number] } }
  | { field: 'SOLAR_TERM'; action: 'SET'; value: { solarTerm: (typeof solarTerms)[number] } }
  | {
      field: 'DAY_POLICY'
      action: 'SET'
      value: { dayPolicy: { classification: (typeof dayPolicies)[number]; name: string | null } }
    }

export interface DayOverrideInput {
  field: DayField
  action: OverrideAction
  text: string
  year: string
  month: string
  day: string
  leapMonth: boolean
  zodiac: (typeof zodiacs)[number]
  solarTerm: (typeof solarTerms)[number]
  classification: (typeof dayPolicies)[number]
}

export function emptyOverrideInput(): DayOverrideInput {
  return {
    field: 'DISPLAY_LABEL',
    action: 'SET',
    text: '',
    year: String(new Date().getFullYear()),
    month: '1',
    day: '1',
    leapMonth: false,
    zodiac: 'RAT',
    solarTerm: 'START_OF_SPRING',
    classification: 'CUSTOM_REST',
  }
}

export function buildDayOverride(input: DayOverrideInput): DayOverrideCommand | null {
  const { field, action } = input
  if (action !== 'SET') return { field, action }
  switch (field) {
    case 'DISPLAY_LABEL':
    case 'DISPLAY_NOTE': {
      const text = input.text.trim()
      return text && text.length <= (field === 'DISPLAY_LABEL' ? 64 : 500)
        ? { field, action, value: { text } }
        : null
    }
    case 'LUNAR_DATE': {
      const year = Number(input.year),
        month = Number(input.month),
        day = Number(input.day)
      if (
        ![year, month, day].every(Number.isInteger) ||
        year < 1 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 30
      )
        return null
      return {
        field,
        action,
        value: { lunarDate: { year, month, day, leapMonth: input.leapMonth } },
      }
    }
    case 'ZODIAC':
      return { field, action, value: { zodiac: input.zodiac } }
    case 'SOLAR_TERM':
      return { field, action, value: { solarTerm: input.solarTerm } }
    case 'DAY_POLICY':
      return input.text.trim().length <= 64
        ? {
            field,
            action,
            value: {
              dayPolicy: { classification: input.classification, name: input.text.trim() || null },
            },
          }
        : null
  }
}

export function snapshotField(
  snapshot: DaySnapshot,
  field: DayField,
  state: DayFieldValue['state'] = 'VALUE',
): DayFieldValue {
  const base: DayFieldValue = {
    field,
    state,
    lunarDate: null,
    zodiac: null,
    solarTerm: null,
    dayPolicy: null,
    text: null,
  }
  switch (field) {
    case 'LUNAR_DATE':
      return { ...base, lunarDate: snapshot.lunarDate }
    case 'ZODIAC':
      return { ...base, zodiac: snapshot.zodiac }
    case 'SOLAR_TERM':
      return { ...base, solarTerm: snapshot.solarTerm }
    case 'DAY_POLICY':
      return { ...base, dayPolicy: snapshot.dayPolicy }
    case 'DISPLAY_LABEL':
      return { ...base, text: snapshot.displayLabel }
    case 'DISPLAY_NOTE':
      return { ...base, text: snapshot.displayNote }
  }
}

export function commandValue(command: DayOverrideCommand): DayFieldValue {
  const base: DayFieldValue = {
    field: command.field,
    state: 'CLEARED',
    lunarDate: null,
    zodiac: null,
    solarTerm: null,
    dayPolicy: null,
    text: null,
  }
  if (command.action !== 'SET') return base
  if (command.field === 'LUNAR_DATE') {
    const lunar = command.value.lunarDate
    return {
      ...base,
      state: 'VALUE',
      lunarDate: {
        ...lunar,
        displayText: `${lunar.year}-${lunar.month}-${lunar.day}${lunar.leapMonth ? ' (leap)' : ''}`,
      },
    }
  }
  return { ...base, state: 'VALUE', ...command.value }
}

export function underlayField(
  day: EffectiveDay,
  field: DayField,
  scope: 'PERSONAL' | 'MANAGED',
): DayFieldValue {
  const resolution = day.resolutions.find((item) => item.field === field)
  return resolution?.source.layer === `${scope}_OVERRIDE` &&
    resolution.source.sourceCalendarId === day.calendarId &&
    resolution.underlay
    ? resolution.underlay
    : snapshotField(day.effective, field, resolution?.state)
}
