import type { EventContentCommand } from './calendar.api'

export type EventForm = {
  title: string
  description: string
  location: string
  timeKind: 'ALL_DAY' | 'TIMED'
  startDate: string
  endDateExclusive: string
  startLocal: string
  endLocal: string
  zoneId: string
  offsetChoice: '' | 'EARLIER' | 'LATER'
}

/** Preserve local dates and TZID; only the server resolves DST gaps/overlaps into instants. */
export function buildEventContent(form: EventForm): EventContentCommand | null {
  if (!form.title.trim() || form.title.trim().length > 128) return null
  const shared = {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    location: form.location.trim() || undefined,
  }
  if (form.timeKind === 'ALL_DAY') {
    return form.startDate && form.endDateExclusive > form.startDate
      ? {
          ...shared,
          timeKind: 'ALL_DAY',
          startDate: form.startDate,
          endDateExclusive: form.endDateExclusive,
        }
      : null
  }
  if (!form.startLocal || form.endLocal <= form.startLocal || !form.zoneId.trim()) return null
  const backendLocal = (value: string) =>
    value.replace('T', ' ') + (value.length === 16 ? ':00' : '')
  return {
    ...shared,
    timeKind: 'TIMED',
    startLocal: backendLocal(form.startLocal),
    endLocal: backendLocal(form.endLocal),
    zoneId: form.zoneId.trim(),
    startOffsetChoice: form.offsetChoice || undefined,
    endOffsetChoice: form.offsetChoice || undefined,
  }
}
