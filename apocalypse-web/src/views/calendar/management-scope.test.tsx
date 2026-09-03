import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarRecord, CalendarRole } from './calendar.api'
import CalendarManagementPage from './calendars'
import PrivateEventsPage from './events'
import ManagedEventsPage from './managed-events'
import ManagedOverridePage from './managed-overrides'

const { query, state, invalidate, errorToast, mutations } = vi.hoisted(() => ({
  query: vi.fn(),
  invalidate: vi.fn(),
  errorToast: vi.fn(),
  mutations: [] as { onError?: (error: Error) => void }[],
  state: { role: 'EDITOR' as CalendarRole, revision: 'DRAFT' },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: query,
  useQueryClient: () => ({ invalidateQueries: invalidate }),
  useMutation: (options: { onError?: (error: Error) => void }) => {
    mutations.push(options)
    return { mutate: vi.fn(), isPending: false }
  },
}))
vi.mock('sonner', () => ({ toast: { error: errorToast, success: vi.fn() } }))
// All global permissions granted: scope checks must still restrict controls and member queries.
vi.mock('@/hooks/usePerm', () => ({ usePerm: () => true }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh', resolvedLanguage: 'zh' },
  }),
}))

describe('calendar scoped management controls', () => {
  beforeEach(() => {
    state.role = 'EDITOR'
    state.revision = 'DRAFT'
    query.mockReset()
    invalidate.mockReset()
    errorToast.mockReset()
    mutations.length = 0
    query.mockImplementation(({ queryKey }: { queryKey: string[]; enabled?: boolean }) => {
      const calendar: CalendarRecord = {
        id: '1',
        calendarKey: 'qa',
        name: 'QA',
        kind: 'MANAGED',
        parentId: null,
        regionCode: 'CN',
        zoneId: 'Asia/Shanghai',
        state: 'ACTIVE',
        currentUserRole: state.role,
        version: 0,
      }
      const revision = {
        id: '3',
        revisionNo: 1,
        state: 'PUBLISHED',
        items: [],
        contentHash: 'hash',
      }
      let data: unknown = { list: [], total: 0 }
      if (queryKey[1] === 'contexts') data = [calendar]
      if (queryKey[1] === 'managed-events' && queryKey[2])
        data = {
          list: [
            {
              id: '2',
              sourceKind: 'USER',
              state: 'ACTIVE',
              revisionState: state.revision,
              revisionNo: 1,
              contentHash: 'hash',
              content: {
                title: 'QA event',
                timeKind: 'ALL_DAY',
                startDate: '2026-09-02',
                endDateExclusive: '2026-09-03',
              },
            },
          ],
        }
      if (queryKey[1] === 'managed-overrides')
        data =
          queryKey[3] === 'draft'
            ? { ...revision, state: 'DRAFT', version: 0 }
            : { list: [revision], total: 1 }
      if (queryKey[1] === 'private-events')
        data = {
          list: ['PRIVATE', 'MANAGED'].map((eventKind) => ({
            id: eventKind,
            eventKind,
            state: 'ACTIVE',
            content: {
              title: eventKind,
              timeKind: 'ALL_DAY',
              startDate: '2026-09-02',
              endDateExclusive: '2026-09-03',
            },
          })),
        }
      return { data, isLoading: false }
    })
  })

  it.each(['EDITOR', 'PUBLISHER'] as const)('limits draft publishing for %s', (role) => {
    state.role = role
    const eventHtml = renderToStaticMarkup(<ManagedEventsPage />)
    const overrideHtml = renderToStaticMarkup(<ManagedOverridePage />)
    expect(eventHtml).toContain('managedEvents.editDraft')
    expect(eventHtml.includes('>managedEvents.publish<')).toBe(role === 'PUBLISHER')
    expect(overrideHtml.includes('>managedOverrides.publishRevision<')).toBe(role === 'PUBLISHER')
    expect(overrideHtml.includes('>managedOverrides.withdraw<')).toBe(role === 'PUBLISHER')
  })

  it.each(['EDITOR', 'PUBLISHER'] as const)('limits published event actions for %s', (role) => {
    state.role = role
    state.revision = 'PUBLISHED'
    const html = renderToStaticMarkup(<ManagedEventsPage />)
    expect(html.includes('>managedEvents.withdraw<')).toBe(role === 'PUBLISHER')
    expect(html.includes('>managedEvents.cancel<')).toBe(role === 'PUBLISHER')
  })

  it.each(['READER', 'EDITOR', 'PUBLISHER'] as const)('scopes member access for %s', (role) => {
    state.role = role
    const html = renderToStaticMarkup(<CalendarManagementPage />)
    expect(html.includes('>calendars.edit<')).toBe(role === 'PUBLISHER')
    expect(html.includes('>calendars.archive<')).toBe(role === 'PUBLISHER')
    expect(html.includes('>calendars.addMember<')).toBe(role === 'PUBLISHER')
    expect(query.mock.calls.find(([config]) => config.queryKey[1] === 'members')?.[0].enabled).toBe(
      role === 'PUBLISHER',
    )
  })

  it('does not query editor workbenches for a reader', () => {
    state.role = 'READER'
    renderToStaticMarkup(<ManagedEventsPage />)
    renderToStaticMarkup(<ManagedOverridePage />)
    for (const [config] of query.mock.calls) {
      if (config.queryKey[1] !== 'contexts') expect(config.enabled).toBe(false)
    }
  })

  it('does not offer private edit or delete actions on a published managed event', () => {
    const html = renderToStaticMarkup(<PrivateEventsPage />)
    expect(html.match(/>privateEvents.edit</g)).toHaveLength(1)
    expect(html.match(/>privateEvents.delete</g)).toHaveLength(1)
    expect(html).toContain('eventKinds.MANAGED')
    expect(html).toContain('privateEvents.managedReadOnly')
  })
  it.each([ManagedEventsPage, ManagedOverridePage, CalendarManagementPage])(
    'refreshes authoritative queries after a failed command without changing the backend message',
    (Page) => {
      renderToStaticMarkup(<Page />)
      const error = new Error('版本冲突，请刷新后重试')
      expect(mutations.length).toBeGreaterThan(0)
      for (const options of mutations) {
        invalidate.mockClear()
        options.onError?.(error)
        expect(errorToast).toHaveBeenLastCalledWith(error.message)
        expect(invalidate).toHaveBeenCalled()
        for (const [config] of invalidate.mock.calls) expect(config.queryKey[0]).toBe('calendar')
      }
    },
  )
})
