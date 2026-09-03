import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DayOverrideItem, DayFieldValue } from './calendar.api'
import { OverrideRevisionDiff } from './override-revision-diff'
import { dayValueText } from './calendar.format'

const underlay: DayFieldValue = {
  field: 'ZODIAC',
  state: 'VALUE',
  zodiac: 'HORSE',
  lunarDate: null,
  solarTerm: null,
  dayPolicy: null,
  text: null,
}
const item: DayOverrideItem = {
  id: '1',
  date: '2026-09-02',
  field: 'ZODIAC',
  action: 'SET',
  value: { ...underlay, zodiac: 'DRAGON' },
  savedUnderlay: underlay,
  savedUnderlayHash: 'hash',
  savedUnderlaySource: {
    layer: 'SYSTEM_DATASET',
    sourceCalendarId: '1',
    sourceCalendarKey: 'system-cn',
    sourceVersion: 'r1',
    action: 'BASE',
  },
}
describe('published override diff', () => {
  it('shows the inherited value when no previous override exists', () => {
    const html = renderToStaticMarkup(<OverrideRevisionDiff before={[]} after={[item]} />)
    expect(html).toContain(dayValueText(underlay))
    expect(html).toContain(dayValueText(item.value))
    expect(html).toContain('system-cn')
  })
  it('previews the restored underlay for an INHERIT action', () => {
    const html = renderToStaticMarkup(
      <OverrideRevisionDiff
        before={[item]}
        after={[{ ...item, action: 'INHERIT', value: null }]}
      />,
    )
    expect(html).toContain(dayValueText(underlay))
    expect(html).toContain('使用上级或系统默认')
    expect(html).not.toContain('INHERIT')
  })
})
