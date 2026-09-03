import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDay, saveManagedOverride, savePersonalOverride } from './calendar.api'
import { buildDayOverride, emptyOverrideInput, dayFieldLabels } from './day-override-model'
import type { DayField } from './calendar.api'
import {
  createPrivateEvent,
  updatePrivateEvent,
  deletePrivateEvent,
  listPrivateEvents,
  type CalendarEvent,
} from './calendar.api'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ request, rawRequest: vi.fn() }))

describe('Calendar approved HTTP adapter', () => {
  beforeEach(() => request.mockReset())
  it('preserves string IDs and owner-free CRUD payloads with optimistic version on updates', async () => {
    const id = '999999999999999999'
    const content = {
      title: 'Private lesson',
      timeKind: 'ALL_DAY' as const,
      startDate: '2026-09-02',
      endDateExclusive: '2026-09-03',
    }
    await createPrivateEvent(id, content)
    expect(request).toHaveBeenLastCalledWith('/calendar/events', {
      method: 'POST',
      body: { calendarId: id, content },
    })
    await updatePrivateEvent({ id, calendarId: '1', version: 7 } as CalendarEvent, content)
    expect(request).toHaveBeenLastCalledWith(`/calendar/events/${id}`, {
      method: 'PUT',
      body: { calendarId: '1', expectedVersion: 7, content },
    })
    await listPrivateEvents('1', '2026-09-01', '2026-09-30')
    expect(request).toHaveBeenLastCalledWith('/calendar/events/page', {
      query: { calendarId: '1', from: '2026-09-01', to: '2026-09-30', page: 1, size: 200 },
    })
    await deletePrivateEvent(id)
    expect(request).toHaveBeenLastCalledWith(`/calendar/events/${id}`, { method: 'DELETE' })
  })
  it.each(Object.keys(dayFieldLabels) as DayField[])(
    'sends %s through the same scoped API without an owner parameter',
    async (field) => {
      const operation = buildDayOverride({ ...emptyOverrideInput(), field, text: 'Business text' })!
      await savePersonalOverride('999999999999999999', '2026-09-02', 7, operation)
      expect(request).toHaveBeenLastCalledWith(
        '/calendar/calendars/999999999999999999/personal-overrides/2026-09-02',
        { method: 'PUT', body: { expectedRevisionNo: 7, operations: [operation] } },
      )
      await saveManagedOverride('999999999999999999', '2026-09-02', 8, operation)
      expect(request).toHaveBeenLastCalledWith(
        '/calendar/calendars/999999999999999999/managed-overrides/draft/days/2026-09-02',
        { method: 'PUT', body: { expectedRevisionNo: 8, operations: [operation] } },
      )
    },
  )
  it('explicitly excludes personal overrides for managed editing previews', async () => {
    await getDay('123', '2026-09-02', false)
    expect(request).toHaveBeenCalledWith('/calendar/days/2026-09-02', {
      query: { calendarId: '123', includePersonal: 'false' },
    })
  })
})
