/** 可见日程包含本人私人项与已发布托管项，只有私人项可在此编辑；平台管理员不穿透所有权。 */

import { DatePicker } from '@/components/ui/date-picker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

import {
  createPrivateEvent,
  deletePrivateEvent,
  listCalendars,
  listPrivateEvents,
  updatePrivateEvent,
  type CalendarEvent,
  type EventContentCommand,
} from '../calendar.api'
import {
  CalendarPageFrame,
  CalendarPicker,
  DataEmpty,
  InlineError,
  StateBadge,
} from '../calendar.ui'
import { toErrorMessage } from '../calendar.format'
import { EventEditor } from '../event-editor'
import { CalendarConfirm } from '../calendar-confirm'
import { monthRange } from '../month-grid'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function PrivateEventsPage() {
  const { t } = useTranslation('calendar')
  const queryClient = useQueryClient()
  const initialRange = monthRange(currentMonth())
  const [calendarSelection, setCalendarSelection] = useState('')
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [editor, setEditor] = useState<CalendarEvent | 'new' | null>(null)

  const calendarsQuery = useQuery({
    queryKey: ['calendar', 'contexts'],
    queryFn: listCalendars,
  })
  const calendarId = calendarsQuery.data?.some((calendar) => calendar.id === calendarSelection)
    ? calendarSelection
    : (calendarsQuery.data?.[0]?.id ?? '')
  const eventsQuery = useQuery({
    queryKey: ['calendar', 'private-events', calendarId, from, to],
    queryFn: () => listPrivateEvents(calendarId, from, to),
    enabled: calendarId !== '' && from !== '' && to >= from,
  })

  const selectedCalendar = calendarsQuery.data?.find((calendar) => calendar.id === calendarId)
  const mutation = useMutation({
    mutationFn: (content: EventContentCommand) =>
      editor === 'new'
        ? createPrivateEvent(calendarId, content)
        : editor
          ? updatePrivateEvent(editor, content)
          : Promise.reject(new Error(t('privateEvents.selectionRequired'))),
    onSuccess: () => {
      toast.success(editor === 'new' ? t('privateEvents.created') : t('privateEvents.updated'))
      setEditor(null)
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'private-events', calendarId] })
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  })
  const deleteMutation = useMutation({
    mutationFn: deletePrivateEvent,
    onSuccess: () => {
      toast.success(t('privateEvents.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'private-events', calendarId] })
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  })

  return (
    <CalendarPageFrame
      title={t('privateEvents.title')}
      description={t('privateEvents.description')}
      actions={
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-end">
          <CalendarPicker
            calendars={calendarsQuery.data ?? []}
            value={calendarId}
            onChange={(value) => {
              setCalendarSelection(value)
              setEditor(null)
            }}
          />
          <Perm perm="calendar:event:add">
            <Button disabled={!calendarId} onClick={() => setEditor('new')}>
              <Plus />
              {t('privateEvents.add')}
            </Button>
          </Perm>
        </div>
      }
    >
      {eventsQuery.error && <InlineError message={toErrorMessage(eventsQuery.error)} />}
      <Card className="gap-4 py-4">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle>{t('privateEvents.range')}</CardTitle>
          <CardDescription>{t('privateEvents.rangeDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 sm:grid-cols-2 sm:px-6 lg:max-w-2xl">
          <DateInput
            id="private-event-from"
            label={t('privateEvents.startDate')}
            value={from}
            onChange={setFrom}
          />
          <DateInput
            id="private-event-to"
            label={t('privateEvents.endDate')}
            value={to}
            onChange={setTo}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(eventsQuery.data?.list ?? []).map((event) => (
          <Card key={event.id} className="gap-4 py-4">
            <CardHeader className="px-4">
              <div className="flex items-start justify-between gap-3">
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
                <StateBadge value={event.state} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{t(`timeKinds.${event.content.timeKind}`)}</Badge>
                <Badge variant="outline">{t(`eventKinds.${event.eventKind}`)}</Badge>
                {event.content.zoneId && <Badge variant="outline">{event.content.zoneId}</Badge>}
              </div>
              <div className="text-muted-foreground">
                {event.content.location || t('privateEvents.noLocation')}
              </div>
              {event.content.description && <p>{event.content.description}</p>}
              {event.eventKind === 'PRIVATE' ? (
                <div className="flex justify-end gap-1 border-t border-border pt-3">
                  <Perm perm="calendar:event:edit">
                    <Button variant="ghost" size="sm" onClick={() => setEditor(event)}>
                      <Pencil />
                      {t('privateEvents.edit')}
                    </Button>
                  </Perm>
                  <Perm perm="calendar:event:remove">
                    <CalendarConfirm
                      title={t('privateEvents.delete')}
                      description={t('privateEvents.deleteWarning')}
                      reviewKey={JSON.stringify([event.id, event.version])}
                      disabled={deleteMutation.isPending}
                      onConfirm={() => deleteMutation.mutate(event.id)}
                      trigger={
                        <Button variant="ghost" size="sm" disabled={deleteMutation.isPending}>
                          <Trash2 className="text-destructive" />
                          {t('privateEvents.delete')}
                        </Button>
                      }
                    >
                      <p>{event.content.title}</p>
                    </CalendarConfirm>
                  </Perm>
                </div>
              ) : (
                <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                  {t('privateEvents.managedReadOnly')}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {!eventsQuery.isLoading && (eventsQuery.data?.list ?? []).length === 0 && (
        <DataEmpty>{t('privateEvents.empty')}</DataEmpty>
      )}

      <EventEditor
        key={`${calendarId}:${editor === 'new' ? 'new' : (editor?.id ?? 'closed')}`}
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        event={editor === 'new' ? null : editor}
        zoneId={selectedCalendar?.zoneId ?? 'Asia/Shanghai'}
        title={editor === 'new' ? t('privateEvents.addTitle') : t('privateEvents.editTitle')}
        pending={mutation.isPending}
        onSubmit={(content) => mutation.mutate(content)}
      />
    </CalendarPageFrame>
  )
}

function DateInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <DatePicker id={id} mode="date" value={value} allowClear={false} onValueChange={onChange} />
    </div>
  )
}

function eventTimeText(event: CalendarEvent, allDayRange: string): string {
  return event.content.timeKind === 'ALL_DAY'
    ? allDayRange
    : `${event.content.startLocal} ${event.content.startOffset ?? ''} → ${event.content.endLocal} ${event.content.endOffset ?? ''}`
}
