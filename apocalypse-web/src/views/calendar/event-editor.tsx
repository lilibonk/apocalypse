import { FieldSelect, FieldOption } from '@/components/ui/field-select'
import { DatePicker } from '@/components/ui/date-picker'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { CalendarEvent, EventContentCommand } from './calendar.api'
import { buildEventContent, type EventForm } from './event-editor-model'

function defaultDate(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function initialForm(event: CalendarEvent | null, zoneId: string): EventForm {
  const date = event?.content.startDate ?? defaultDate()
  return {
    title: event?.content.title ?? '',
    description: event?.content.description ?? '',
    location: event?.content.location ?? '',
    timeKind: event?.content.timeKind ?? 'ALL_DAY',
    startDate: date,
    endDateExclusive: event?.content.endDateExclusive ?? nextDate(date),
    startLocal: event?.content.startLocal?.replace(' ', 'T').slice(0, 16) ?? `${date}T09:00`,
    endLocal: event?.content.endLocal?.replace(' ', 'T').slice(0, 16) ?? `${date}T10:00`,
    zoneId: event?.content.zoneId ?? zoneId,
    offsetChoice: '',
  }
}

export function EventEditor({
  open,
  onOpenChange,
  event,
  zoneId,
  title,
  pending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: CalendarEvent | null
  zoneId: string
  title: string
  pending: boolean
  onSubmit: (content: EventContentCommand) => void
}) {
  const { t } = useTranslation('calendar')
  const [form, setForm] = useState<EventForm>(() => initialForm(event, zoneId))

  const content = buildEventContent(form)
  const valid = content !== null

  const submit = () => {
    if (content) onSubmit(content)
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('eventEditor.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormInput
            id="event-title"
            label={t('eventEditor.title')}
            value={form.title}
            maxLength={128}
            onChange={(value) => setForm((current) => ({ ...current, title: value }))}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="event-time-kind">{t('eventEditor.timeKind')}</Label>
            <FieldSelect
              id="event-time-kind"
              value={form.timeKind}
              onValueChange={(selection) =>
                setForm((current) => ({
                  ...current,
                  timeKind: selection as EventForm['timeKind'],
                }))
              }
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <FieldOption value="ALL_DAY">{t('timeKinds.ALL_DAY')}</FieldOption>
              <FieldOption value="TIMED">{t('timeKinds.TIMED')}</FieldOption>
            </FieldSelect>
          </div>
          {form.timeKind === 'ALL_DAY' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormInput
                id="event-start-date"
                label={t('eventEditor.startDate')}
                type="date"
                value={form.startDate}
                onChange={(value) => setForm((current) => ({ ...current, startDate: value }))}
              />
              <FormInput
                id="event-end-date"
                label={t('eventEditor.endDateExclusive')}
                type="date"
                value={form.endDateExclusive}
                onChange={(value) =>
                  setForm((current) => ({ ...current, endDateExclusive: value }))
                }
              />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormInput
                  id="event-start-local"
                  label={t('eventEditor.startLocal')}
                  type="datetime-local"
                  value={form.startLocal}
                  onChange={(value) => setForm((current) => ({ ...current, startLocal: value }))}
                />
                <FormInput
                  id="event-end-local"
                  label={t('eventEditor.endLocal')}
                  type="datetime-local"
                  value={form.endLocal}
                  onChange={(value) => setForm((current) => ({ ...current, endLocal: value }))}
                />
              </div>
              <FormInput
                id="event-zone-id"
                label={t('eventEditor.zoneId')}
                value={form.zoneId}
                onChange={(value) => setForm((current) => ({ ...current, zoneId: value }))}
              />
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {t('eventEditor.offsetChoice')}
                </summary>
                <div className="mt-3 grid gap-1.5">
                  <Label htmlFor="event-offset-choice">{t('eventEditor.offsetChoice')}</Label>
                  <FieldSelect
                    id="event-offset-choice"
                    value={form.offsetChoice}
                    onValueChange={(selection) =>
                      setForm((current) => ({
                        ...current,
                        offsetChoice: selection as EventForm['offsetChoice'],
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <FieldOption value="">{t('eventEditor.offsetAuto')}</FieldOption>
                    <FieldOption value="EARLIER">{t('eventEditor.offsetEarlier')}</FieldOption>
                    <FieldOption value="LATER">{t('eventEditor.offsetLater')}</FieldOption>
                  </FieldSelect>
                </div>
              </details>
            </>
          )}
          <FormInput
            id="event-location"
            label={t('eventEditor.location')}
            value={form.location}
            maxLength={256}
            onChange={(value) => setForm((current) => ({ ...current, location: value }))}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="event-description">{t('eventEditor.eventDescription')}</Label>
            <Textarea
              id="event-description"
              value={form.description}
              maxLength={2000}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('eventEditor.cancel')}
          </Button>
          <Button disabled={!valid || pending} onClick={submit}>
            {t('eventEditor.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormInput({
  id,
  label,
  value,
  type = 'text',
  maxLength,
  onChange,
}: {
  id: string
  label: string
  value: string
  type?: string
  maxLength?: number
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {type === 'date' || type === 'datetime-local' ? (
        <DatePicker id={id} mode={type} value={value} allowClear={false} onValueChange={onChange} />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}
