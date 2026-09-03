import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DaySnapshot, EffectiveDay } from './calendar.api'
import CalendarOverviewPage from './index'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: query }))
vi.mock('./calendar.api', () => ({ listCalendars: vi.fn(), listDays: vi.fn() }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))

const baseline: DaySnapshot = {
  lunarDate: null,
  zodiac: null,
  solarTerm: null,
  dayPolicy: null,
  displayLabel: null,
  displayNote: 'Baseline note',
}

describe('calendar date details', () => {
  beforeEach(() => {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const day: EffectiveDay = {
      date,
      dayOfWeek: 'MONDAY',
      calendarId: '1',
      calendarKey: 'test',
      zoneId: 'Asia/Shanghai',
      baselineRef: {
        regionCode: 'CN',
        releaseKey: 'test-r1',
        providerKey: 'test',
        providerVersion: '1',
        supportedFrom: date,
        supportedTo: date,
        publishedHolidayYears: [now.getFullYear()],
      },
      baseline,
      effective: { ...baseline, displayNote: 'User <note> & unchanged text' },
      resolutions: [],
    }
    query.mockImplementation(({ queryKey }: { queryKey: string[] }) => ({
      data: queryKey[1] === 'contexts' ? [{ id: '1', name: 'Test', calendarKey: 'test' }] : [day],
      isLoading: false,
    }))
  })

  it('renders baseline and effective notes as escaped business text', () => {
    const html = renderToStaticMarkup(<CalendarOverviewPage />)

    expect(html).toContain('displayNote')
    expect(html).toContain('Baseline note')
    expect(html).toContain('User &lt;note&gt; &amp; unchanged text')
    expect(html).not.toContain('User <note>')
  })
})
