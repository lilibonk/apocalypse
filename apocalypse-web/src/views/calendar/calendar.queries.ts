import { ModuleScope, type ScopedRequest } from '@/lib/query/module-scope'
import type { Query } from '@tanstack/react-query'
import * as api from './calendar.api'

export const calendarScope = new ModuleScope('calendar')

type CalendarId = { calendarId: string }
type Range = CalendarId & { from: string; to: string }
type Paging = { page: number; size: number }

export const calendarQueries = {
  contexts: calendarScope.query(
    'contexts',
    ['calendar:calendar:list'],
    (_: Record<string, never>, request) => api.listCalendars(request),
  ),
  days: calendarScope.query(
    'days',
    ['calendar:day:list'],
    (p: Range & { includePersonal: boolean }, request) =>
      api.listDays(p.calendarId, p.from, p.to, p.includePersonal, request),
  ),
  day: calendarScope.query(
    'day',
    ['calendar:day:read'],
    (p: CalendarId & { date: string; includePersonal: boolean }, request) =>
      api.getDay(p.calendarId, p.date, p.includePersonal, request),
  ),
  members: calendarScope.query(
    'members',
    ['calendar:member:list'],
    (p: CalendarId & Paging, request) => api.listMembers(p.calendarId, p.page, p.size, request),
  ),
  personalOverrides: calendarScope.query(
    'personal-overrides',
    ['calendar:personal-override:list'],
    (p: Range, request) => api.getPersonalOverride(p.calendarId, p.from, p.to, request),
  ),
  personalConflicts: calendarScope.query(
    'personal-conflicts',
    ['calendar:personal-override:list'],
    (p: CalendarId, request) => api.listPersonalConflicts(p.calendarId, request),
  ),
  managedDraft: calendarScope.query(
    'managed-draft',
    ['calendar:managed-override:list'],
    (p: CalendarId, request) => api.getManagedDraft(p.calendarId, request),
  ),
  managedRevisions: calendarScope.query(
    'managed-revisions',
    ['calendar:managed-override:list'],
    (p: CalendarId, request) => api.listManagedRevisions(p.calendarId, request),
  ),
  managedConflicts: calendarScope.query(
    'managed-conflicts',
    ['calendar:managed-override:list'],
    (p: CalendarId, request) => api.listManagedConflicts(p.calendarId, request),
  ),
  privateEvents: calendarScope.query(
    'private-events',
    ['calendar:event:list'],
    (p: Range, request) => api.listPrivateEvents(p.calendarId, p.from, p.to, request),
  ),
  managedEvents: calendarScope.query(
    'managed-events',
    ['calendar:managed-event:list'],
    (p: CalendarId, request) => api.listManagedEvents(p.calendarId, request),
  ),
  projectionGrants: calendarScope.query(
    'projection-grants',
    ['calendar:projection-grant:list'],
    (p: CalendarId, request) => api.listProjectionGrants(p.calendarId, request),
  ),
  dataImports: calendarScope.query(
    'data-imports',
    ['calendar:data-import:list'],
    (p: Paging, request) => api.listDataImports(p.page, p.size, request),
  ),
  importDiff: calendarScope.query(
    'import-diff',
    ['calendar:data-import:list'],
    (p: { id: string }, request) => api.getDataImportDiff(p.id, request),
  ),
}

/** The API's last parameter is transport-only; business arguments and return types stay inferred. */
function operation<Args extends unknown[], Data>(
  perm: string,
  execute: (...args: [...Args, transport?: Partial<ScopedRequest>]) => Promise<Data>,
) {
  return calendarScope.operation([perm], (request, ...args: Args) => execute(...args, request))
}

export const calendarOperations = {
  createCalendar: operation('calendar:calendar:add', api.createCalendar),
  updateCalendar: operation('calendar:calendar:edit', api.updateCalendar),
  archiveCalendar: operation('calendar:calendar:archive', api.archiveCalendar),
  saveMember: operation('calendar:member:edit', api.saveMember),
  removeMember: operation('calendar:member:edit', api.removeMember),
  savePersonalOverride: operation('calendar:personal-override:edit', api.savePersonalOverride),
  resolvePersonalConflict: operation(
    'calendar:personal-override:edit',
    api.resolvePersonalConflict,
  ),
  saveManagedOverride: operation('calendar:managed-override:edit', api.saveManagedOverride),
  discardManagedDraft: operation('calendar:managed-override:edit', api.discardManagedDraft),
  publishManagedOverride: operation(
    'calendar:managed-override:publish',
    api.publishManagedOverride,
  ),
  withdrawManagedOverride: operation(
    'calendar:managed-override:publish',
    api.withdrawManagedOverride,
  ),
  createPrivateEvent: operation('calendar:event:add', api.createPrivateEvent),
  updatePrivateEvent: operation('calendar:event:edit', api.updatePrivateEvent),
  deletePrivateEvent: operation('calendar:event:remove', api.deletePrivateEvent),
  createManagedEvent: operation('calendar:managed-event:edit', api.createManagedEvent),
  saveManagedEventDraft: operation('calendar:managed-event:edit', api.saveManagedEventDraft),
  discardManagedEventDraft: operation('calendar:managed-event:edit', api.discardManagedEventDraft),
  publishManagedEvent: operation('calendar:managed-event:publish', api.publishManagedEvent),
  withdrawManagedEvent: operation('calendar:managed-event:publish', api.withdrawManagedEvent),
  cancelManagedEvent: operation('calendar:managed-event:publish', api.cancelManagedEvent),
  saveProjectionGrant: operation('calendar:projection-grant:edit', api.saveProjectionGrant),
  removeProjectionGrant: operation('calendar:projection-grant:edit', api.removeProjectionGrant),
  uploadDataImport: operation('calendar:data-import:upload', api.uploadDataImport),
  validateDataImport: operation('calendar:data-import:upload', api.validateDataImport),
  reviewDataImport: operation('calendar:data-import:publish', api.reviewDataImport),
  publishDataImport: operation('calendar:data-import:publish', api.publishDataImport),
  rejectDataImport: operation('calendar:data-import:publish', api.rejectDataImport),
  downloadDataImportTemplate: operation(
    'calendar:data-import:list',
    api.downloadDataImportTemplate,
  ),
  downloadDataImportFile: operation('calendar:data-import:list', api.downloadDataImportFile),
}

export const calendarFilters = {
  managedOverrides: (params: Partial<CalendarId>) => ({
    predicate: (query: Query) =>
      calendarQueries.managedDraft.filter(params).predicate(query) ||
      calendarQueries.managedRevisions.filter(params).predicate(query),
  }),
}
