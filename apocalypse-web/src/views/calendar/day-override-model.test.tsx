import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { DayField } from './calendar.api'
import { DayOverrideEditor } from './day-override-editor'
import {
  buildDayOverride,
  commandValue,
  dayFieldLabels,
  emptyOverrideInput,
} from './day-override-model'

describe('six-field override editor contract', () => {
  const fields = Object.keys(dayFieldLabels) as DayField[]
  it.each(fields)('%s has an explicit SET value and clear/inherit omit it entirely', (field) => {
    const input = { ...emptyOverrideInput(), field, text: 'Business value' }
    const set = buildDayOverride(input)
    expect(set).toMatchObject({ field, action: 'SET' })
    expect(set && commandValue(set)).toMatchObject({ field, state: 'VALUE' })
    for (const action of ['CLEAR', 'INHERIT'] as const) {
      expect(buildDayOverride({ ...input, action })).toEqual({ field, action })
    }
  })
  it.each(fields)('renders all fields and a correctly labeled value control for %s', (field) => {
    const html = renderToStaticMarkup(
      <DayOverrideEditor value={{ ...emptyOverrideInput(), field }} onChange={vi.fn()} />,
    )
    for (const option of fields) expect(html).toContain(`value="${option}"`)
    expect(html).toContain('<label')
    expect(html).not.toContain('type="file"')
  })
  it('validates text lengths and lunar bounds without changing user text into translations', () => {
    const input = emptyOverrideInput()
    expect(buildDayOverride(input)).toBeNull()
    expect(buildDayOverride({ ...input, text: 'x'.repeat(65) })).toBeNull()
    expect(
      buildDayOverride({ ...input, field: 'DISPLAY_NOTE', text: 'x'.repeat(500) }),
    ).not.toBeNull()
    expect(buildDayOverride({ ...input, field: 'DISPLAY_NOTE', text: 'x'.repeat(501) })).toBeNull()
    expect(buildDayOverride({ ...input, field: 'LUNAR_DATE', month: '13' })).toBeNull()
    expect(buildDayOverride({ ...input, field: 'LUNAR_DATE', day: '0' })).toBeNull()
    expect(buildDayOverride({ ...input, field: 'LUNAR_DATE', day: '1.5' })).toBeNull()
    expect(buildDayOverride({ ...input, field: 'LUNAR_DATE', leapMonth: true })).toMatchObject({
      value: { lunarDate: { leapMonth: true } },
    })
    expect(buildDayOverride({ ...input, text: '<script>business</script>' })).toMatchObject({
      value: { text: '<script>business</script>' },
    })
  })
})
