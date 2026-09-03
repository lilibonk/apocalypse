/**
 * Calendar 月视图是非标准二维日期网格，并含逐字段 provenance 对照，无法用 DynaLayer
 * 的搜索区 + 表格 schema 忠实表达，因此按前端宪法使用手写逃逸舱。
 */

import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { listCalendars, listDays } from './calendar.api'
import {
  CalendarPageFrame,
  CalendarPicker,
  DataEmpty,
  FieldPair,
  InlineError,
  StateBadge,
} from './calendar.ui'
import { calendarValueText, toErrorMessage } from './calendar.format'
import { monthCells, monthRange, shiftMonth } from './month-grid'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function CalendarOverviewPage() {
  const { t, i18n } = useTranslation('calendar')
  const [calendarSelection, setCalendarSelection] = useState('')
  const [month, setMonth] = useState(currentMonth)
  const [selectedDate, setSelectedDate] = useState(`${currentMonth()}-01`)
  const range = monthRange(month)
  const cells = useMemo(() => monthCells(month), [month])

  const calendarsQuery = useQuery({
    queryKey: ['calendar', 'contexts'],
    queryFn: listCalendars,
  })
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
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
        year: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${month}-01T00:00:00Z`)),
    [i18n.language, i18n.resolvedLanguage, month],
  )
  const weekdays = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
      weekday: 'short',
      timeZone: 'UTC',
    })
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(Date.UTC(2024, 0, 7 + index))),
    )
  }, [i18n.language, i18n.resolvedLanguage])

  return (
    <CalendarPageFrame
      title={t('viewTitle')}
      description={t('viewDescription')}
      actions={
        <CalendarPicker
          calendars={calendarsQuery.data ?? []}
          value={calendarId}
          onChange={setCalendarSelection}
        />
      }
    >
      {calendarsQuery.error && <InlineError message={toErrorMessage(calendarsQuery.error)} />}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
        <Card className="gap-4 py-4">
          <CardHeader className="flex-row items-center justify-between gap-3 px-4">
            <div>
              <CardTitle>{monthLabel}</CardTitle>
              <CardDescription>{t('selectDateHint')}</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label={t('previousMonth')}
                onClick={() => {
                  const next = shiftMonth(month, -1)
                  setMonth(next)
                  setSelectedDate(`${next}-01`)
                }}
              >
                <ChevronLeft />
              </Button>
              <input
                type="month"
                value={month}
                onChange={(event) => {
                  if (!event.target.value) return
                  setMonth(event.target.value)
                  setSelectedDate(`${event.target.value}-01`)
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={t('selectMonth')}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label={t('nextMonth')}
                onClick={() => {
                  const next = shiftMonth(month, 1)
                  setMonth(next)
                  setSelectedDate(`${next}-01`)
                }}
              >
                <ChevronRight />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4">
            {daysQuery.error ? (
              <InlineError message={toErrorMessage(daysQuery.error)} />
            ) : daysQuery.isLoading ? (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }, (_, index) => (
                  <Skeleton key={index} className="h-20" />
                ))}
              </div>
            ) : calendarId === '' ? (
              <DataEmpty>{t('noCalendar')}</DataEmpty>
            ) : (
              <div
                role="grid"
                aria-label={t('calendarGrid', { month: monthLabel })}
                className="grid grid-cols-7 gap-1"
              >
                {weekdays.map((weekday) => (
                  <div
                    role="columnheader"
                    key={weekday}
                    className="py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {weekday}
                  </div>
                ))}
                {cells.map((cell, index) => {
                  if (!cell) return <div key={`empty-${index}`} aria-hidden="true" />
                  const day = days.get(cell.isoDate)
                  const selectedCell = selectedDate === cell.isoDate
                  const policy = day?.effective.dayPolicy
                  return (
                    <button
                      role="gridcell"
                      key={cell.isoDate}
                      type="button"
                      aria-selected={selectedCell}
                      onClick={() => setSelectedDate(cell.isoDate)}
                      className={cn(
                        'min-h-20 rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        selectedCell && 'border-primary bg-primary/5 ring-1 ring-primary',
                      )}
                    >
                      <span className="text-sm font-semibold">{cell.day}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {day?.effective.lunarDate?.displayText ?? '—'}
                      </span>
                      <span className="mt-1 block truncate text-xs font-medium text-primary">
                        {calendarValueText(day?.effective.displayLabel) ||
                          calendarValueText(policy?.name) ||
                          calendarValueText(day?.effective.solarTerm) ||
                          ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 py-4">
          <CardHeader className="px-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{selected?.date ?? t('dateDetails')}</CardTitle>
              {selected && <Badge variant="outline">{selected.zoneId}</Badge>}
            </div>
            <CardDescription>
              {selected
                ? `${selected.calendarKey} · ${selected.baselineRef.releaseKey}`
                : t('chooseDate')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4">
            {!selected ? (
              <DataEmpty>{t('noDays')}</DataEmpty>
            ) : (
              <>
                <div className="space-y-2">
                  <FieldPair
                    label={t('lunarDate')}
                    baseline={selected.baseline.lunarDate?.displayText}
                    effective={selected.effective.lunarDate?.displayText}
                  />
                  <FieldPair
                    label={t('zodiac')}
                    baseline={calendarValueText(selected.baseline.zodiac)}
                    effective={calendarValueText(selected.effective.zodiac)}
                  />
                  <FieldPair
                    label={t('solarTerm')}
                    baseline={calendarValueText(selected.baseline.solarTerm)}
                    effective={calendarValueText(selected.effective.solarTerm)}
                  />
                  <FieldPair
                    label={t('dayPolicy')}
                    baseline={calendarValueText(selected.baseline.dayPolicy?.name)}
                    effective={calendarValueText(selected.effective.dayPolicy?.name)}
                  />
                  <FieldPair
                    label={t('displayLabel')}
                    baseline={calendarValueText(selected.baseline.displayLabel)}
                    effective={calendarValueText(selected.effective.displayLabel)}
                  />
                  <FieldPair
                    label={t('displayNote')}
                    baseline={selected.baseline.displayNote}
                    effective={selected.effective.displayNote}
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{t('fieldProvenance')}</h3>
                  <div className="space-y-2">
                    {selected.resolutions.map((resolution) => (
                      <div
                        key={resolution.field}
                        className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{resolution.field}</div>
                          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {resolution.source.layer} ·{' '}
                            {resolution.source.sourceCalendarKey ??
                              resolution.source.sourceVersion ??
                              t('base')}
                          </div>
                        </div>
                        <StateBadge value={resolution.conflictState} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </CalendarPageFrame>
  )
}
