/** Month navigation and field-level date details are a two-dimensional, non-CRUD workspace. */
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import { dateCells, localToday } from '@/components/ui/date-picker-model'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { listCalendars, listDays, type EffectiveDay } from './calendar.api'
import {
  CalendarPageFrame,
  CalendarPicker,
  DataEmpty,
  FieldPair,
  InlineError,
  StateBadge,
} from './calendar.ui'
import {
  calendarValueText,
  compactLunarText,
  dayValueText,
  toErrorMessage,
} from './calendar.format'
import { dayFieldLabels, snapshotField } from './day-override-model'
import { monthRange, shiftMonth } from './month-grid'

export default function CalendarOverviewPage() {
  const { t, i18n } = useTranslation('calendar')
  const [calendarSelection, setCalendarSelection] = useState('')
  const [month, setMonth] = useState(() => localToday().slice(0, 7))
  const [selectedDate, setSelectedDate] = useState('')
  const trigger = useRef<HTMLButtonElement | null>(null)
  const range = monthRange(month)
  const calendarsQuery = useQuery({ queryKey: ['calendar', 'contexts'], queryFn: listCalendars })
  const calendarId = calendarsQuery.data?.some((calendar) => calendar.id === calendarSelection)
    ? calendarSelection
    : (calendarsQuery.data?.[0]?.id ?? '')
  const daysQuery = useQuery({
    queryKey: ['calendar', 'days', calendarId, range.from, range.to],
    queryFn: () => listDays(calendarId, range.from, range.to),
    enabled: calendarId !== '',
  })
  const days = useMemo(
    () => new Map((daysQuery.data ?? []).map((day) => [day.date, day])),
    [daysQuery.data],
  )
  const selected = days.get(selectedDate)
  const locale = i18n.resolvedLanguage ?? i18n.language
  const monthLabel = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T12:00:00Z`))
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const changeMonth = (next: string) => {
    if (next) {
      setMonth(next)
      setSelectedDate('')
    }
  }

  return (
    <CalendarPageFrame
      title={t('viewTitle')}
      description={t('viewDescription')}
      actions={
        <CalendarPicker
          calendars={calendarsQuery.data ?? []}
          value={calendarId}
          onChange={(next) => {
            setCalendarSelection(next)
            setSelectedDate('')
          }}
        />
      }
    >
      {calendarsQuery.error && <InlineError message={toErrorMessage(calendarsQuery.error)} />}
      <Card className="gap-4 py-4">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-4 sm:flex-row">
          <div>
            <CardTitle>{monthLabel}</CardTitle>
            <CardDescription className="mt-1">{t('selectDateHint')}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('previousMonth')}
              disabled={month <= '1901-01'}
              onClick={() => changeMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft />
            </Button>
            <DatePicker
              mode="month"
              value={month}
              onValueChange={changeMonth}
              allowClear={false}
              min="1901-01-01"
              max="2100-12-31"
              aria-label={t('selectMonth')}
              className="w-36"
            />
            <Button
              variant="outline"
              size="icon"
              aria-label={t('nextMonth')}
              disabled={month >= '2100-12'}
              onClick={() => changeMonth(shiftMonth(month, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          {daysQuery.error ? (
            <InlineError message={toErrorMessage(daysQuery.error)} />
          ) : daysQuery.isLoading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }, (_, index) => (
                <Skeleton key={index} className="h-24" />
              ))}
            </div>
          ) : !calendarId ? (
            <DataEmpty>{t('noCalendar')}</DataEmpty>
          ) : (
            <table
              className="w-full table-fixed border-separate border-spacing-1"
              aria-label={t('calendarGrid', { month: monthLabel })}
            >
              <thead>
                <tr>
                  {Array.from({ length: 7 }, (_, index) => (
                    <th
                      key={index}
                      className="pb-3 text-center text-xs font-medium text-muted-foreground"
                    >
                      {weekday.format(new Date(Date.UTC(2024, 0, 7 + index)))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dateCells(month).map((week, row) => (
                  <tr key={row}>
                    {week.map((date, column) => {
                      const day = date ? days.get(date) : undefined
                      const secondary = compactLunarText(day?.effective.lunarDate, locale)
                      const label =
                        calendarValueText(day?.effective.displayLabel) ||
                        calendarValueText(day?.effective.dayPolicy?.name) ||
                        calendarValueText(day?.effective.solarTerm) ||
                        ''
                      return (
                        <td key={date ?? column} className="p-0 align-top">
                          {date && (
                            <button
                              type="button"
                              aria-label={[date, secondary, label].filter(Boolean).join(' · ')}
                              aria-current={date === localToday() ? 'date' : undefined}
                              onClick={(event) => {
                                trigger.current = event.currentTarget
                                setSelectedDate(date)
                              }}
                              className={cn(
                                'flex min-h-24 w-full min-w-0 flex-col rounded-md border border-border bg-background p-1.5 text-left transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-28 sm:p-3',
                                date === localToday() && 'border-primary/50 bg-primary/5',
                                date === selectedDate && 'border-primary bg-primary/10',
                              )}
                            >
                              <span
                                className={cn(
                                  'flex size-6 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                                  date === localToday() && 'bg-primary text-primary-foreground',
                                )}
                              >
                                {Number(date.slice(8))}
                              </span>
                              <span className="mt-1 block w-full truncate text-xs text-muted-foreground">
                                {secondary || '—'}
                              </span>
                              <span
                                className="mt-1 block w-full truncate text-xs font-medium text-primary"
                                title={label}
                              >
                                {label}
                              </span>
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Sheet
        open={!!selectedDate}
        onOpenChange={(open) => {
          if (!open) setSelectedDate('')
        }}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            trigger.current?.focus()
          }}
        >
          <SheetHeader className="border-b border-border p-6 pr-12">
            <SheetTitle>
              {selectedDate} · {t('dateDetails')}
            </SheetTitle>
            <SheetDescription>
              {calendarsQuery.data?.find((item) => item.id === calendarId)?.name}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 px-6 pb-6">
            {selected ? (
              <DateDetailsContent day={selected} />
            ) : (
              <DataEmpty>{t('noDays')}</DataEmpty>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </CalendarPageFrame>
  )
}

export function DateDetailsContent({ day }: { day: EffectiveDay }) {
  const { t } = useTranslation('calendar')
  const fields = Object.entries(dayFieldLabels) as [keyof typeof dayFieldLabels, string][]
  const needsReview = day.resolutions.some((item) => item.conflictState === 'NEEDS_REVIEW')
  return (
    <>
      {needsReview && (
        <div role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          {t('reviewExplanation')}
        </div>
      )}
      <section aria-label={t('effectiveValue')}>
        <h2 className="mb-3 text-base font-semibold">{t('effectiveValue')}</h2>
        <dl className="divide-y divide-border">
          {fields.map(([field, key]) => (
            <div key={field} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3 text-sm">
              <dt className="text-muted-foreground">{t(key)}</dt>
              <dd className="break-words font-medium">
                {dayValueText(
                  snapshotField(
                    day.effective,
                    field,
                    day.resolutions.find((item) => item.field === field)?.state,
                  ),
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">{t('compareDefaults')}</summary>
        <div className="mt-2">
          {fields.map(([field, key]) => (
            <FieldPair
              key={field}
              label={t(key)}
              baseline={dayValueText(snapshotField(day.baseline, field))}
              effective={dayValueText(snapshotField(day.effective, field))}
            />
          ))}
        </div>
      </details>
      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">{t('fieldProvenance')}</summary>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t('sourceExplanation')}
        </p>
        <div className="mt-3 divide-y divide-border">
          {day.resolutions.map((item) => (
            <div key={item.field} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">{t(dayFieldLabels[item.field])}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(`layers.${item.source.layer}`)}
                </p>
              </div>
              {item.conflictState !== 'NONE' && <StateBadge value={item.conflictState} />}
            </div>
          ))}
        </div>
        <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t('technicalDetails')}
          </summary>
          <dl className="mt-3 space-y-2 break-all text-xs">
            <div>
              <dt>{t('calendars.zoneId')}</dt>
              <dd>{day.zoneId}</dd>
            </div>
            <div>
              <dt>{t('calendars.calendarKey')}</dt>
              <dd>{day.calendarKey}</dd>
            </div>
            <div>
              <dt>{t('baselineVersion')}</dt>
              <dd>{day.baselineRef.releaseKey}</dd>
            </div>
            {day.resolutions.map((item) => (
              <div key={item.field}>
                <dt>{t(dayFieldLabels[item.field])}</dt>
                <dd>
                  {item.source.sourceCalendarKey ?? '—'} · {item.source.sourceVersion ?? '—'}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </details>
    </>
  )
}
