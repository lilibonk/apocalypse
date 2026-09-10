import type { RequestOptions } from '@/lib/api/client'
/** Calendar v1 页面适配层。所有雪花 ID 保持 string，页面不接触响应信封。 */
import { rawRequest, request } from '@/lib/api/client'
import type { PageResult, SnowflakeId } from '@/lib/api/types'
import type { DayOverrideCommand } from './day-override-model'
export type CalendarRole = 'READER' | 'EDITOR' | 'PUBLISHER'
export type CalendarState = 'ACTIVE' | 'ARCHIVED'
export type DayField =
  'LUNAR_DATE' | 'ZODIAC' | 'SOLAR_TERM' | 'DAY_POLICY' | 'DISPLAY_LABEL' | 'DISPLAY_NOTE'
export type OverrideAction = 'SET' | 'CLEAR' | 'INHERIT'
export type ConflictResolution = 'KEEP' | 'REBASE' | 'INHERIT'
export interface CalendarRecord {
  id: SnowflakeId
  calendarKey: string
  name: string
  kind: 'SYSTEM' | 'MANAGED'
  parentId: SnowflakeId | null
  regionCode: string
  zoneId: string
  state: CalendarState
  currentUserRole: CalendarRole | null
  version: number
}
export interface CalendarMember {
  userId: SnowflakeId
  username: string
  nickname: string | null
  role: CalendarRole
  state: 'ACTIVE' | 'INACTIVE'
  version: number
}
export interface DayFieldValue {
  field: DayField
  lunarDate: {
    year: number
    month: number
    day: number
    leapMonth: boolean
    displayText: string
  } | null
  zodiac: string | null
  solarTerm: string | null
  dayPolicy: {
    classification: string
    name: string | null
  } | null
  text: string | null
  state: 'VALUE' | 'CLEARED' | 'UNPUBLISHED'
}
export interface DaySnapshot {
  lunarDate: DayFieldValue['lunarDate']
  zodiac: string | null
  solarTerm: string | null
  dayPolicy: DayFieldValue['dayPolicy']
  displayLabel: string | null
  displayNote: string | null
}
export interface ResolutionSource {
  layer: 'SYSTEM_DATASET' | 'SYSTEM_CORRECTION' | 'MANAGED_OVERRIDE' | 'PERSONAL_OVERRIDE' | 'NONE'
  sourceCalendarId: SnowflakeId | null
  sourceCalendarKey: string | null
  sourceVersion: string | null
  action: OverrideAction | 'BASE'
}
export interface FieldResolution {
  field: DayField
  state: DayFieldValue['state']
  source: ResolutionSource
  underlay: DayFieldValue | null
  underlayHash: string
  conflictState: 'NONE' | 'NEEDS_REVIEW' | 'KEPT'
  conflictId: SnowflakeId | null
}
export interface EffectiveDay {
  date: string
  dayOfWeek: string
  calendarId: SnowflakeId
  calendarKey: string
  zoneId: string
  baselineRef: {
    regionCode: string
    releaseKey: string
    providerKey: string
    providerVersion: string
    supportedFrom: string
    supportedTo: string
    publishedHolidayYears: number[]
  }
  baseline: DaySnapshot
  effective: DaySnapshot
  resolutions: FieldResolution[]
}
export interface DayOverrideItem {
  id: SnowflakeId
  date: string
  field: DayField
  action: OverrideAction
  value: DayFieldValue | null
  savedUnderlay: DayFieldValue
  savedUnderlayHash: string
  savedUnderlaySource: ResolutionSource
}
export interface OverrideRevision {
  id: SnowflakeId
  calendarId: SnowflakeId
  scope: 'PERSONAL' | 'MANAGED'
  revisionNo: number
  state: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'WITHDRAWN'
  baselineReleaseId: SnowflakeId
  contentHash: string
  version: number
  items: DayOverrideItem[]
}
export interface OverrideConflict {
  id: SnowflakeId
  overrideItemId: SnowflakeId
  calendarId: SnowflakeId
  scope: 'PERSONAL' | 'MANAGED'
  date: string
  field: DayField
  triggerType: string
  triggerKey: string
  previousUnderlay: DayFieldValue
  currentUnderlay: DayFieldValue
  previousHash: string
  currentHash: string
  state: 'OPEN' | 'KEPT' | 'REBASED' | 'INHERITED'
  detectedAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  resolutionRevisionId: SnowflakeId | null
}
export interface EventContent {
  title: string
  description: string | null
  location: string | null
  timeKind: 'ALL_DAY' | 'TIMED'
  startDate: string | null
  endDateExclusive: string | null
  startLocal: string | null
  endLocal: string | null
  zoneId: string | null
  startOffset: string | null
  endOffset: string | null
}
export interface CalendarEvent {
  id: SnowflakeId
  calendarId: SnowflakeId
  eventKind: 'PRIVATE' | 'MANAGED'
  ownerUserId: SnowflakeId | null
  sourceKind: 'USER' | 'PROJECTION'
  state: 'ACTIVE' | 'WITHDRAWN' | 'CANCELLED'
  version: number
  revisionNo: number
  revisionVersion: number
  revisionState: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'WITHDRAWN' | 'CANCELLED'
  contentHash: string
  content: EventContent
}
export interface ProjectionGrant {
  id: SnowflakeId
  calendarId: SnowflakeId
  sourceSystem: string
  publishMode: 'DRAFT_ONLY' | 'DIRECT_PUBLISH'
  state: 'ACTIVE' | 'INACTIVE'
  version: number
}
export type DataImportTarget = 'SYSTEM_BASELINE' | 'MANAGED_OVERRIDE'
export type DataImportState =
  'UPLOADED' | 'VALIDATED' | 'INVALID' | 'REVIEWED' | 'PUBLISHED' | 'REJECTED'
export interface ImportValidationIssue {
  rowNumber: number
  column: string
  errorCode: string
  message: string
}
export interface ImportValidation {
  valid: boolean
  rowCount: number
  validatorVersion: string
  issues: ImportValidationIssue[]
}
export interface ImportDiffItem {
  date: string
  changeType: 'ADDED' | 'MODIFIED' | 'INHERITED' | 'UNCHANGED'
  oldAction: OverrideAction | 'BASE' | null
  oldClassification: string | null
  oldName: string | null
  newAction: OverrideAction
  newClassification: string | null
  newName: string | null
}
export interface ImportDiff {
  added: number
  modified: number
  inherited: number
  unchanged: number
  conflicts: number
  targetContentHash: string
  items: ImportDiffItem[]
}
export interface DataImportRecord {
  id: SnowflakeId
  importKey: string
  targetType: DataImportTarget
  targetCalendarId: SnowflakeId | null
  regionCode: string
  dataYear: number
  sourceClaim: 'OFFICIAL_NOTICE' | 'LOCAL_POLICY'
  assuranceLevel: 'ONLINE_VERIFIED' | 'OFFLINE_DOCUMENT_REVIEWED' | 'UNVERIFIED'
  documentNo: string | null
  documentTitle: string | null
  issuer: string | null
  documentPublishedOn: string | null
  sourceUri: string | null
  state: DataImportState
  dataFile: {
    fileName: string
    contentType: string
    size: number
    sha256: string
  }
  evidenceFile: {
    fileName: string
    contentType: string
    size: number
    sha256: string
  } | null
  normalizedPayloadHash: string | null
  validation: ImportValidation | null
  diff: ImportDiff | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  publishedBy: string | null
  publishedAt: string | null
  publishedReleaseId: SnowflakeId | null
  publishedRevisionId: SnowflakeId | null
  version: number
}
export interface EventContentCommand {
  title: string
  description?: string
  location?: string
  timeKind: 'ALL_DAY' | 'TIMED'
  startDate?: string
  endDateExclusive?: string
  startLocal?: string
  endLocal?: string
  zoneId?: string
  startOffsetChoice?: 'EARLIER' | 'LATER'
  endOffsetChoice?: 'EARLIER' | 'LATER'
}
export function listCalendars(
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<CalendarRecord[]> {
  return request<CalendarRecord[]>('/calendar/calendars', {
    ...transport,
  })
}
export function listDays(
  calendarId: SnowflakeId,
  from: string,
  to: string,
  includePersonal = true,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<EffectiveDay[]> {
  return request<EffectiveDay[]>('/calendar/days', {
    ...{
      query: { calendarId, from, to, includePersonal: String(includePersonal) },
    },
    ...transport,
  })
}
export function getDay(
  calendarId: SnowflakeId,
  date: string,
  includePersonal = true,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<EffectiveDay> {
  return request<EffectiveDay>(`/calendar/days/${date}`, {
    ...{
      query: { calendarId, includePersonal: String(includePersonal) },
    },
    ...transport,
  })
}
export function createCalendar(
  body: {
    calendarKey: string
    name: string
    parentId: SnowflakeId
    regionCode: string
    zoneId: string
  },
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<CalendarRecord> {
  return request<CalendarRecord>('/calendar/calendars', {
    ...{ method: 'POST', body },
    ...transport,
  })
}
export function updateCalendar(
  calendar: CalendarRecord,
  body: {
    name: string
    parentId: SnowflakeId
    zoneId: string
    state: CalendarState
  },
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<CalendarRecord> {
  return request<CalendarRecord>(`/calendar/calendars/${calendar.id}`, {
    ...{
      method: 'PUT',
      body: { ...body, expectedVersion: calendar.version },
    },
    ...transport,
  })
}
export function archiveCalendar(
  calendarId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/calendar/calendars/${calendarId}/archive`, {
    ...{ method: 'POST' },
    ...transport,
  })
}
export function listMembers(
  calendarId: SnowflakeId,
  page = 1,
  size = 50,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<PageResult<CalendarMember>> {
  return request<PageResult<CalendarMember>>(`/calendar/calendars/${calendarId}/members/page`, {
    ...{
      query: { page, size },
    },
    ...transport,
  })
}
export function saveMember(
  calendarId: SnowflakeId,
  userId: SnowflakeId,
  role: CalendarRole,
  expectedVersion: number,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<CalendarMember> {
  return request<CalendarMember>(`/calendar/calendars/${calendarId}/members/${userId}`, {
    ...{
      method: 'PUT',
      body: { role, expectedVersion },
    },
    ...transport,
  })
}
export function removeMember(
  calendarId: SnowflakeId,
  userId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/calendar/calendars/${calendarId}/members/${userId}`, {
    ...{
      method: 'DELETE',
    },
    ...transport,
  })
}
export function getPersonalOverride(
  calendarId: SnowflakeId,
  from: string,
  to: string,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<OverrideRevision | null> {
  return request<OverrideRevision | null>(`/calendar/calendars/${calendarId}/personal-overrides`, {
    ...{
      query: { from, to },
    },
    ...transport,
  })
}
export function savePersonalOverride(
  calendarId: SnowflakeId,
  date: string,
  expectedRevisionNo: number,
  operation: DayOverrideCommand,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<OverrideRevision> {
  return request<OverrideRevision>(`/calendar/calendars/${calendarId}/personal-overrides/${date}`, {
    ...{
      method: 'PUT',
      body: { expectedRevisionNo, operations: [operation] },
    },
    ...transport,
  })
}
export function listPersonalConflicts(
  calendarId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<PageResult<OverrideConflict>> {
  return request<PageResult<OverrideConflict>>(
    `/calendar/calendars/${calendarId}/personal-override-conflicts/page`,
    {
      ...{ query: { page: 1, size: 200 } },
      ...transport,
    },
  )
}
export function resolvePersonalConflict(
  calendarId: SnowflakeId,
  conflictId: SnowflakeId,
  resolution: ConflictResolution,
  expectedRevisionNo: number,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<OverrideConflict> {
  return request<OverrideConflict>(
    `/calendar/calendars/${calendarId}/personal-override-conflicts/${conflictId}/resolve`,
    {
      ...{ method: 'POST', body: { resolution, expectedRevisionNo } },
      ...transport,
    },
  )
}
export function getManagedDraft(
  calendarId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<OverrideRevision | null> {
  return request<OverrideRevision | null>(
    `/calendar/calendars/${calendarId}/managed-overrides/draft`,
    {
      ...transport,
    },
  )
}
export function listManagedRevisions(
  calendarId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<PageResult<OverrideRevision>> {
  return request<PageResult<OverrideRevision>>(
    `/calendar/calendars/${calendarId}/managed-overrides/revisions/page`,
    {
      ...{ query: { page: 1, size: 200 } },
      ...transport,
    },
  )
}
export function saveManagedOverride(
  calendarId: SnowflakeId,
  date: string,
  expectedRevisionNo: number,
  operation: DayOverrideCommand,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<OverrideRevision> {
  return request<OverrideRevision>(
    `/calendar/calendars/${calendarId}/managed-overrides/draft/days/${date}`,
    {
      ...{ method: 'PUT', body: { expectedRevisionNo, operations: [operation] } },
      ...transport,
    },
  )
}
export function discardManagedDraft(
  calendarId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/calendar/calendars/${calendarId}/managed-overrides/draft`, {
    ...{
      method: 'DELETE',
    },
    ...transport,
  })
}
export function listManagedConflicts(
  calendarId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<PageResult<OverrideConflict>> {
  return request<PageResult<OverrideConflict>>(
    `/calendar/calendars/${calendarId}/managed-override-conflicts/page`,
    {
      ...{ query: { page: 1, size: 200 } },
      ...transport,
    },
  )
}
export function publishManagedOverride(
  calendarId: SnowflakeId,
  draft: OverrideRevision,
  conflictResolutions: {
    conflictId: SnowflakeId
    resolution: ConflictResolution
  }[],
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<OverrideRevision> {
  return request<OverrideRevision>(
    `/calendar/calendars/${calendarId}/managed-overrides/draft/publish`,
    {
      ...{
        method: 'POST',
        body: {
          expectedDraftVersion: draft.version,
          expectedContentHash: draft.contentHash,
          conflictResolutions,
        },
      },
      ...transport,
    },
  )
}
export function withdrawManagedOverride(
  calendarId: SnowflakeId,
  revisionId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(
    `/calendar/calendars/${calendarId}/managed-overrides/revisions/${revisionId}/withdraw`,
    {
      ...{ method: 'POST' },
      ...transport,
    },
  )
}
export function listPrivateEvents(
  calendarId: SnowflakeId,
  from: string,
  to: string,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<PageResult<CalendarEvent>> {
  return request<PageResult<CalendarEvent>>('/calendar/events/page', {
    ...{
      query: { calendarId, from, to, page: 1, size: 200 },
    },
    ...transport,
  })
}
export function createPrivateEvent(
  calendarId: SnowflakeId,
  content: EventContentCommand,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<CalendarEvent> {
  return request<CalendarEvent>('/calendar/events', {
    ...{
      method: 'POST',
      body: { calendarId, content },
    },
    ...transport,
  })
}
export function updatePrivateEvent(
  event: CalendarEvent,
  content: EventContentCommand,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<CalendarEvent> {
  return request<CalendarEvent>(`/calendar/events/${event.id}`, {
    ...{
      method: 'PUT',
      body: { calendarId: event.calendarId, expectedVersion: event.version, content },
    },
    ...transport,
  })
}
export function deletePrivateEvent(
  eventId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/calendar/events/${eventId}`, {
    ...{ method: 'DELETE' },
    ...transport,
  })
}
export function listManagedEvents(
  calendarId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<PageResult<CalendarEvent>> {
  return request<PageResult<CalendarEvent>>(
    `/calendar/calendars/${calendarId}/managed-events/page`,
    {
      ...{ query: { page: 1, size: 200 } },
      ...transport,
    },
  )
}
export function createManagedEvent(
  calendarId: SnowflakeId,
  content: EventContentCommand,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<CalendarEvent> {
  return request<CalendarEvent>(`/calendar/calendars/${calendarId}/managed-events`, {
    ...{
      method: 'POST',
      body: { content },
    },
    ...transport,
  })
}
export function saveManagedEventDraft(
  calendarId: SnowflakeId,
  event: CalendarEvent,
  content: EventContentCommand,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<CalendarEvent> {
  return request<CalendarEvent>(
    `/calendar/calendars/${calendarId}/managed-events/${event.id}/draft`,
    {
      ...{
        method: 'PUT',
        body: {
          expectedDraftVersion: event.revisionState === 'DRAFT' ? event.revisionVersion : 0,
          content,
        },
      },
      ...transport,
    },
  )
}
export function discardManagedEventDraft(
  calendarId: SnowflakeId,
  eventId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/calendar/calendars/${calendarId}/managed-events/${eventId}/draft`, {
    ...{
      method: 'DELETE',
    },
    ...transport,
  })
}
export function publishManagedEvent(
  calendarId: SnowflakeId,
  event: CalendarEvent,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<CalendarEvent> {
  return request<CalendarEvent>(
    `/calendar/calendars/${calendarId}/managed-events/${event.id}/publish`,
    {
      ...{
        method: 'POST',
        body: {
          expectedDraftVersion: event.revisionVersion,
          expectedContentHash: event.contentHash,
        },
      },
      ...transport,
    },
  )
}
export function withdrawManagedEvent(
  calendarId: SnowflakeId,
  eventId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/calendar/calendars/${calendarId}/managed-events/${eventId}/withdraw`, {
    ...{
      method: 'POST',
    },
    ...transport,
  })
}
export function cancelManagedEvent(
  calendarId: SnowflakeId,
  eventId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/calendar/calendars/${calendarId}/managed-events/${eventId}/cancel`, {
    ...{
      method: 'POST',
    },
    ...transport,
  })
}
export function listProjectionGrants(
  calendarId: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<ProjectionGrant[]> {
  return request<ProjectionGrant[]>(`/calendar/calendars/${calendarId}/projection-grants`, {
    ...transport,
  })
}
export function saveProjectionGrant(
  calendarId: SnowflakeId,
  sourceSystem: string,
  publishMode: ProjectionGrant['publishMode'],
  expectedVersion: number,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<ProjectionGrant> {
  return request<ProjectionGrant>(
    `/calendar/calendars/${calendarId}/projection-grants/${encodeURIComponent(sourceSystem)}`,
    {
      ...{ method: 'PUT', body: { publishMode, expectedVersion } },
      ...transport,
    },
  )
}
export function removeProjectionGrant(
  calendarId: SnowflakeId,
  sourceSystem: string,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(
    `/calendar/calendars/${calendarId}/projection-grants/${encodeURIComponent(sourceSystem)}`,
    {
      ...{ method: 'DELETE' },
      ...transport,
    },
  )
}
export function listDataImports(
  page = 1,
  size = 50,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<PageResult<DataImportRecord>> {
  return request<PageResult<DataImportRecord>>('/calendar/data-imports/page', {
    ...{
      query: { page, size },
    },
    ...transport,
  })
}
export function uploadDataImport(
  metadata: {
    importKey: string
    targetType: DataImportTarget
    targetCalendarId?: SnowflakeId
    regionCode: string
    dataYear: number
    sourceClaim: DataImportRecord['sourceClaim']
    assuranceLevel: DataImportRecord['assuranceLevel']
    documentNo?: string
    documentTitle?: string
    issuer?: string
    documentPublishedOn?: string
    sourceUri?: string
  },
  dataFile: File,
  evidenceFile?: File,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<DataImportRecord> {
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('dataFile', dataFile)
  if (evidenceFile) form.append('evidenceFile', evidenceFile)
  return request<DataImportRecord>('/calendar/data-imports', {
    ...{ method: 'POST', body: form },
    ...transport,
  })
}
export function validateDataImport(
  id: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<DataImportRecord> {
  return request<DataImportRecord>(`/calendar/data-imports/${id}/validate`, {
    ...{ method: 'POST' },
    ...transport,
  })
}
export function getDataImportDiff(
  id: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<ImportDiff> {
  return request<ImportDiff>(`/calendar/data-imports/${id}/diff`, {
    ...transport,
  })
}
export function reviewDataImport(
  value: DataImportRecord,
  reviewNote: string,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<DataImportRecord> {
  return request<DataImportRecord>(`/calendar/data-imports/${value.id}/review`, {
    ...{
      method: 'POST',
      body: {
        expectedVersion: value.version,
        expectedDataFileSha256: value.dataFile.sha256,
        expectedNormalizedPayloadHash: value.normalizedPayloadHash,
        sourceAttested: true,
        reviewNote,
      },
    },
    ...transport,
  })
}
export function publishDataImport(
  value: DataImportRecord,
  diff: ImportDiff,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<DataImportRecord> {
  return request<DataImportRecord>(`/calendar/data-imports/${value.id}/publish`, {
    ...{
      method: 'POST',
      body: {
        expectedVersion: value.version,
        expectedNormalizedPayloadHash: value.normalizedPayloadHash,
        expectedTargetContentHash: diff.targetContentHash,
      },
    },
    ...transport,
  })
}
export function rejectDataImport(
  value: DataImportRecord,
  reviewNote: string,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<DataImportRecord> {
  return request<DataImportRecord>(`/calendar/data-imports/${value.id}/reject`, {
    ...{
      method: 'POST',
      body: { expectedVersion: value.version, reviewNote },
    },
    ...transport,
  })
}
export function downloadDataImportTemplate(
  targetType: DataImportTarget,
  year: number,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<Blob> {
  return rawRequest<Blob>('/calendar/data-imports/template', 'blob', {
    ...{
      query: { targetType, year },
    },
    ...transport,
  })
}
export function downloadDataImportFile(
  id: SnowflakeId,
  type: 'data' | 'evidence',
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<Blob> {
  return rawRequest<Blob>(`/calendar/data-imports/${id}/files/${type}`, 'blob', {
    ...transport,
  })
}
