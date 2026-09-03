import { describe, expect, it } from 'vitest'
import { buildEventContent, type EventForm } from './event-editor-model'

const form: EventForm = {
  title: ' Lesson ',
  description: '',
  location: '',
  timeKind: 'ALL_DAY',
  startDate: '2026-11-01',
  endDateExclusive: '2026-11-02',
  startLocal: '2026-11-01T01:15',
  endLocal: '2026-11-01T01:45',
  zoneId: 'America/New_York',
  offsetChoice: '',
}
describe('event editor time contract', () => {
  it.each(['Asia/Shanghai', 'America/New_York', 'Pacific/Honolulu'])(
    'keeps all-day dates unchanged for %s',
    (zoneId) => {
      expect(buildEventContent({ ...form, zoneId })).toEqual({
        title: 'Lesson',
        description: undefined,
        location: undefined,
        timeKind: 'ALL_DAY',
        startDate: '2026-11-01',
        endDateExclusive: '2026-11-02',
      })
    },
  )
  it.each(['', 'EARLIER', 'LATER'] as const)(
    'preserves ambiguous wall clock and explicit offset choice %s',
    (offsetChoice) => {
      expect(buildEventContent({ ...form, timeKind: 'TIMED', offsetChoice })).toMatchObject({
        startLocal: '2026-11-01 01:15:00',
        endLocal: '2026-11-01 01:45:00',
        zoneId: 'America/New_York',
        startOffsetChoice: offsetChoice || undefined,
        endOffsetChoice: offsetChoice || undefined,
      })
    },
  )
  it('keeps Shanghai wall clock rather than implicitly using the browser timezone', () => {
    expect(
      buildEventContent({ ...form, timeKind: 'TIMED', zoneId: 'Asia/Shanghai' }),
    ).toMatchObject({ startLocal: '2026-11-01 01:15:00', zoneId: 'Asia/Shanghai' })
  })
  it('rejects blank titles, empty zones and non-positive intervals', () => {
    expect(buildEventContent({ ...form, title: ' ' })).toBeNull()
    expect(buildEventContent({ ...form, endDateExclusive: form.startDate })).toBeNull()
    expect(buildEventContent({ ...form, timeKind: 'TIMED', zoneId: '' })).toBeNull()
    expect(buildEventContent({ ...form, timeKind: 'TIMED', endLocal: form.startLocal })).toBeNull()
  })
})
