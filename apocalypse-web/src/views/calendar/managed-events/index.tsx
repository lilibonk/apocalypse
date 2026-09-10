import { ModuleAccess } from '@/lib/query/ModuleAccess'
export { calendarScope as queryScope } from '../calendar.queries'
import { calendarScope, calendarQueries, calendarOperations } from '../calendar.queries'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
/** 托管日程是带范围角色与草稿发布状态机的工作台，超出标准 CRUD schema。 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Pencil, Plus, Send, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import type { CalendarEvent, EventContentCommand } from '../calendar.api'
import {
  CalendarPageFrame,
  CalendarTrace,
  CalendarPicker,
  DataEmpty,
  InlineError,
  StateBadge,
} from '../calendar.ui'
import { toErrorMessage } from '../calendar.format'
import { EventEditor } from '../event-editor'
import { CalendarConfirm } from '../calendar-confirm'

function ManagedEventsPage() {
  const { t } = useTranslation('calendar')
  const queryClient = useQueryClient()
  const [calendarSelection, setCalendarSelection] = useState('')
  const [editor, setEditor] = useState<CalendarEvent | 'new' | null>(null)

  const calendarsQuery = useQuery(calendarQueries.contexts({}))
  const managedCalendars = useMemo(
    () =>
      (calendarsQuery.data ?? []).filter(
        (calendar) =>
          calendar.kind === 'MANAGED' &&
          (calendar.currentUserRole === 'EDITOR' || calendar.currentUserRole === 'PUBLISHER'),
      ),
    [calendarsQuery.data],
  )
  const calendarId = managedCalendars.some((calendar) => calendar.id === calendarSelection)
    ? calendarSelection
    : (managedCalendars[0]?.id ?? '')
  const eventsQuery = useQuery(
    calendarQueries.managedEvents({ calendarId: calendarId }, calendarId !== ''),
  )
  const onDenied = useCalendarDenial(calendarId, [calendarsQuery.error, eventsQuery.error], () => {
    setCalendarSelection('')
    setEditor(null)
  })

  const selectedCalendar = managedCalendars.find((calendar) => calendar.id === calendarId)
  const canPublish = selectedCalendar?.currentUserRole === 'PUBLISHER'
  const invalidate = () => {
    void queryClient.invalidateQueries(calendarQueries.contexts.filter({}))
    void queryClient.invalidateQueries(
      calendarQueries.managedEvents.filter({ calendarId: calendarId }),
    )
    void queryClient.invalidateQueries(
      calendarQueries.privateEvents.filter({ calendarId: calendarId }),
    )
  }

  const saveMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([calendarId, editor]),
    mutationFn: (run, content: EventContentCommand) =>
      editor === 'new'
        ? run(calendarOperations.createManagedEvent, calendarId, content)
        : editor
          ? run(calendarOperations.saveManagedEventDraft, calendarId, editor, content)
          : Promise.reject(new Error(t('managedEvents.selectionRequired'))),
    onSuccess: () => {
      toast.success(
        editor === 'new' ? t('managedEvents.draftCreated') : t('managedEvents.draftSaved'),
      )
      setEditor(null)
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })
  const publishMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([calendarId, editor]),
    mutationFn: (run, event: CalendarEvent) =>
      run(calendarOperations.publishManagedEvent, calendarId, event),
    onSuccess: () => {
      toast.success(t('managedEvents.published'))
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })
  const actionMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([calendarId, editor]),
    mutationFn: (
      run,
      {
        event,
        action,
      }: {
        event: CalendarEvent
        action: 'discard' | 'withdraw' | 'cancel'
      },
    ) => {
      if (action === 'discard')
        return run(calendarOperations.discardManagedEventDraft, calendarId, event.id)
      if (action === 'withdraw')
        return run(calendarOperations.withdrawManagedEvent, calendarId, event.id)
      return run(calendarOperations.cancelManagedEvent, calendarId, event.id)
    },
    onSuccess: () => {
      toast.success(t('managedEvents.stateUpdated'))
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })

  return (
    <CalendarPageFrame
      title={t('managedEvents.title')}
      description={t('managedEvents.description')}
      actions={
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-end">
          <CalendarPicker
            calendars={managedCalendars}
            value={calendarId}
            onChange={(value) => {
              setCalendarSelection(value)
              setEditor(null)
            }}
            roles={['EDITOR', 'PUBLISHER']}
          />
          <Perm perm="calendar:managed-event:edit">
            <Button disabled={!calendarId} onClick={() => setEditor('new')}>
              <Plus />
              {t('managedEvents.addDraft')}
            </Button>
          </Perm>
        </div>
      }
    >
      {eventsQuery.error && <InlineError message={toErrorMessage(eventsQuery.error)} />}
      <div className="space-y-3">
        {(eventsQuery.data?.list ?? []).map((event) => (
          <Card key={event.id} className="gap-4 py-4">
            <CardHeader className="px-4 sm:px-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <CardTitle className="truncate">{event.content.title}</CardTitle>
                  <CardDescription>
                    {eventTimeText(
                      event,
                      t('eventEditor.allDayRange', {
                        start: event.content.startDate,
                        end: event.content.endDateExclusive,
                      }),
                    )}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StateBadge value={event.state} />
                  <StateBadge value={event.revisionState} />
                  <Badge variant="outline">{t(`sourceKinds.${event.sourceKind}`)}</Badge>
                  <Badge variant="outline">
                    {t('managedEvents.revision', { number: event.revisionNo })}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 sm:px-6">
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">{t('managedEvents.location')}</div>
                  <div className="mt-1">{event.content.location || '—'}</div>
                </div>
                <div className="sm:col-span-2">
                  <CalendarTrace>
                    <div className="text-xs text-muted-foreground">
                      {t('managedEvents.contentHash')}
                    </div>
                    <div className="mt-1 truncate font-mono text-xs">{event.contentHash}</div>
                  </CalendarTrace>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                {event.sourceKind === 'USER' && event.state !== 'CANCELLED' && (
                  <Perm perm="calendar:managed-event:edit">
                    <Button variant="outline" size="sm" onClick={() => setEditor(event)}>
                      <Pencil />
                      {t('managedEvents.editDraft')}
                    </Button>
                  </Perm>
                )}
                {event.revisionState === 'DRAFT' && event.sourceKind === 'USER' && (
                  <>
                    <Perm perm="calendar:managed-event:edit">
                      <EventActionConfirm
                        event={event}
                        calendarName={selectedCalendar?.name ?? ''}
                        action="discard"
                        pending={actionMutation.isPending}
                        onConfirm={() => actionMutation.mutate({ event, action: 'discard' })}
                        trigger={
                          <Button variant="outline" size="sm" disabled={actionMutation.isPending}>
                            <Trash2 />
                            {t('managedEvents.discard')}
                          </Button>
                        }
                      />
                    </Perm>
                    {canPublish && (
                      <Perm perm="calendar:managed-event:publish">
                        <EventActionConfirm
                          event={event}
                          calendarName={selectedCalendar?.name ?? ''}
                          action="publish"
                          pending={publishMutation.isPending}
                          onConfirm={() => publishMutation.mutate(event)}
                          trigger={
                            <Button size="sm" disabled={publishMutation.isPending}>
                              <Send />
                              {t('managedEvents.publish')}
                            </Button>
                          }
                        />
                      </Perm>
                    )}
                  </>
                )}
                {event.revisionState === 'PUBLISHED' && canPublish && (
                  <Perm perm="calendar:managed-event:publish">
                    <EventActionConfirm
                      event={event}
                      calendarName={selectedCalendar?.name ?? ''}
                      action="withdraw"
                      pending={actionMutation.isPending}
                      onConfirm={() => actionMutation.mutate({ event, action: 'withdraw' })}
                      trigger={
                        <Button variant="outline" size="sm" disabled={actionMutation.isPending}>
                          <Undo2 />
                          {t('managedEvents.withdraw')}
                        </Button>
                      }
                    />
                    <EventActionConfirm
                      event={event}
                      calendarName={selectedCalendar?.name ?? ''}
                      action="cancel"
                      pending={actionMutation.isPending}
                      onConfirm={() => actionMutation.mutate({ event, action: 'cancel' })}
                      trigger={
                        <Button variant="destructive" size="sm" disabled={actionMutation.isPending}>
                          <Ban />
                          {t('managedEvents.cancel')}
                        </Button>
                      }
                    />
                  </Perm>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!eventsQuery.isLoading && (eventsQuery.data?.list ?? []).length === 0 && (
        <DataEmpty>{t('managedEvents.empty')}</DataEmpty>
      )}

      <EventEditor
        key={`${calendarId}:${editor === 'new' ? 'new' : (editor?.id ?? 'closed')}`}
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        event={editor === 'new' ? null : editor}
        zoneId={selectedCalendar?.zoneId ?? 'Asia/Shanghai'}
        title={editor === 'new' ? t('managedEvents.addTitle') : t('managedEvents.editTitle')}
        pending={saveMutation.isPending}
        onSubmit={(content) => saveMutation.mutate(content)}
      />
    </CalendarPageFrame>
  )
}

function eventTimeText(event: CalendarEvent, allDayRange: string): string {
  return event.content.timeKind === 'ALL_DAY'
    ? allDayRange
    : `${event.content.startLocal} ${event.content.startOffset ?? ''} → ${event.content.endLocal} ${event.content.endOffset ?? ''} · ${event.content.zoneId}`
}

function EventActionConfirm({
  event,
  calendarName,
  action,
  pending,
  onConfirm,
  trigger,
}: {
  event: CalendarEvent
  calendarName: string
  action: 'publish' | 'discard' | 'withdraw' | 'cancel'
  pending: boolean
  onConfirm: () => void
  trigger: React.ReactElement
}) {
  const { t } = useTranslation('calendar')
  return (
    <CalendarConfirm
      title={t(`managedEvents.${action}`)}
      description={t(`managedEvents.${action}Warning`)}
      reviewKey={JSON.stringify([
        event.id,
        event.version,
        event.revisionNo,
        event.revisionVersion,
        event.contentHash,
      ])}
      disabled={pending}
      onConfirm={onConfirm}
      trigger={trigger}
    >
      <p>
        {calendarName} · {event.content.title}
      </p>
      <p>
        {eventTimeText(
          event,
          t('eventEditor.allDayRange', {
            start: event.content.startDate,
            end: event.content.endDateExclusive,
          }),
        )}
      </p>
      <p>
        {t('managedEvents.revision', { number: event.revisionNo })} · {event.revisionState}
      </p>
    </CalendarConfirm>
  )
}

export default function CalendarModulePage() {
  return <ModuleAccess scope={calendarScope} component={ManagedEventsPage} />
}
import { useCalendarDenial } from '../use-calendar-denial'
