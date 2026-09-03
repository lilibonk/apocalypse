import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { Button } from './button'
import { Input } from './input'
import { FieldOption, FieldSelect } from './field-select'
import { dateCells, localToday, moveDate, moveMonth, validDate } from './date-picker-model'

type Mode = 'date' | 'month' | 'datetime-local'

/** Local wall-clock strings only: selection never converts a business date to another time zone. */
export function DatePicker({
  value,
  onValueChange,
  id,
  mode = 'date',
  disabled,
  allowClear = true,
  min = '0001-01-01',
  max = '9999-12-31',
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  id?: string
  mode?: Mode
  disabled?: boolean
  allowClear?: boolean
  min?: string
  max?: string
  className?: string
  'aria-label'?: string
}) {
  const { t, i18n } = useTranslation()
  const label = ariaLabel ?? t(`dateControl.${mode}`)
  const locale = i18n.resolvedLanguage ?? i18n.language
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(localToday)
  const [time, setTime] = useState('09:00')
  const gridRef = useRef<HTMLTableElement>(null)
  const uniqueId = useId()
  const month = cursor.slice(0, 7)
  const navigationStep = mode === 'month' ? 12 : 1
  const previousCursor = moveMonth(cursor, -navigationStep)
  const nextCursor = moveMonth(cursor, navigationStep)
  const navigationPrecision = mode === 'month' ? 4 : 7
  const inRange = (date: string) => date >= min && date <= max
  const clamp = (date: string) => (date < min ? min : date > max ? max : date)
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, '0'),
    label: new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, index, 1)),
    ),
  }))
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`))
  const commit = (date: string) => {
    onValueChange(
      mode === 'month' ? date.slice(0, 7) : mode === 'datetime-local' ? `${date}T${time}` : date,
    )
    setOpen(false)
  }
  const focusDay = (date: string) => {
    const next = clamp(date)
    setCursor(next)
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus(),
    )
  }
  const onDayKey = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay()
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -day,
      End: 6 - day,
    }
    if (event.key in offsets) {
      event.preventDefault()
      focusDay(moveDate(date, offsets[event.key]))
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      focusDay(moveMonth(date, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1)))
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const selected = mode === 'month' ? `${value}-01` : value.slice(0, 10)
          setCursor(clamp(validDate(selected) ? selected : localToday()))
          setTime(/^\d{2}:\d{2}$/.test(value.slice(11, 16)) ? value.slice(11, 16) : '09:00')
        }
        setOpen(next)
      }}
    >
      <Popover.Trigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          data-slot="date-picker-trigger"
          className={cn(
            'w-full min-w-0 justify-between font-normal tabular-nums',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{value ? value.replace('T', ' ') : label}</span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-slot="popover-content"
          aria-label={label}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-80 max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] overflow-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
          onOpenAutoFocus={(event) => {
            if (mode !== 'month') {
              event.preventDefault()
              gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
            }
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(mode === 'month' ? 'dateControl.previousYear' : 'dateControl.previous')}
              disabled={
                previousCursor === cursor ||
                previousCursor.slice(0, navigationPrecision) < min.slice(0, navigationPrecision)
              }
              onClick={() => setCursor(clamp(previousCursor))}
            >
              <ChevronLeft />
            </Button>
            <YearField
              key={cursor.slice(0, 4)}
              aria-label={t('dateControl.year')}
              min={Number(min.slice(0, 4))}
              max={Number(max.slice(0, 4))}
              value={Number(cursor.slice(0, 4))}
              onCommit={(year) =>
                setCursor(clamp(`${String(year).padStart(4, '0')}-${month.slice(5)}-01`))
              }
            />
            {mode !== 'month' && (
              <FieldSelect
                aria-label={t('dateControl.month')}
                value={month.slice(5)}
                onValueChange={(next) => setCursor(clamp(`${month.slice(0, 4)}-${next}-01`))}
              >
                {months.map((item) => (
                  <FieldOption key={item.value} value={item.value}>
                    {item.label}
                  </FieldOption>
                ))}
              </FieldSelect>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(mode === 'month' ? 'dateControl.nextYear' : 'dateControl.next')}
              disabled={
                nextCursor === cursor ||
                nextCursor.slice(0, navigationPrecision) > max.slice(0, navigationPrecision)
              }
              onClick={() => setCursor(clamp(nextCursor))}
            >
              <ChevronRight />
            </Button>
          </div>
          {mode === 'month' ? (
            <div className="grid grid-cols-3 gap-2" aria-label={t('dateControl.month')}>
              {months.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  variant={item.value === month.slice(5) ? 'default' : 'ghost'}
                  disabled={
                    `${month.slice(0, 4)}-${item.value}` < min.slice(0, 7) ||
                    `${month.slice(0, 4)}-${item.value}` > max.slice(0, 7)
                  }
                  onClick={() => commit(`${month.slice(0, 4)}-${item.value}-01`)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          ) : (
            <table
              ref={gridRef}
              role="grid"
              aria-describedby={uniqueId}
              aria-label={dateLabel(cursor)}
              className="w-full table-fixed border-collapse text-center text-sm"
            >
              <thead>
                <tr>
                  {Array.from({ length: 7 }, (_, index) => (
                    <th
                      key={index}
                      scope="col"
                      className="pb-2 text-xs font-normal text-muted-foreground"
                    >
                      {weekday.format(new Date(Date.UTC(2024, 0, 7 + index)))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dateCells(month).map((week, row) => (
                  <tr key={row}>
                    {week.map((date, column) => (
                      <td key={date ?? column} aria-selected={date === cursor} className="p-0.5">
                        {date && (
                          <button
                            type="button"
                            data-date={date}
                            tabIndex={date === cursor ? 0 : -1}
                            disabled={!inRange(date)}
                            aria-label={dateLabel(date)}
                            aria-current={date === localToday() ? 'date' : undefined}
                            onKeyDown={(event) => onDayKey(event, date)}
                            onClick={() =>
                              mode === 'datetime-local' ? setCursor(date) : commit(date)
                            }
                            className={cn(
                              'flex aspect-square w-full items-center justify-center rounded-md text-sm tabular-nums outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
                              date === cursor &&
                                'bg-primary text-primary-foreground hover:bg-primary/90',
                              date === localToday() &&
                                date !== cursor &&
                                'font-semibold text-primary',
                            )}
                          >
                            {Number(date.slice(8))}
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mode === 'datetime-local' && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 text-xs text-muted-foreground">
                {t('dateControl.selected', { date: cursor })}
              </div>
              <div className="flex items-center gap-2">
                <FieldSelect
                  aria-label={t('dateControl.hour')}
                  value={time.slice(0, 2)}
                  onValueChange={(hour) => setTime(`${hour}:${time.slice(3)}`)}
                >
                  {Array.from({ length: 24 }, (_, index) => {
                    const hour = String(index).padStart(2, '0')
                    return (
                      <FieldOption key={hour} value={hour}>
                        {hour}
                      </FieldOption>
                    )
                  })}
                </FieldSelect>
                <span aria-hidden="true">:</span>
                <FieldSelect
                  aria-label={t('dateControl.minute')}
                  value={time.slice(3)}
                  onValueChange={(minute) => setTime(`${time.slice(0, 2)}:${minute}`)}
                >
                  {Array.from({ length: 60 }, (_, index) => {
                    const minute = String(index).padStart(2, '0')
                    return (
                      <FieldOption key={minute} value={minute}>
                        {minute}
                      </FieldOption>
                    )
                  })}
                </FieldSelect>
                <Button type="button" onClick={() => commit(cursor)}>
                  {t('dateControl.confirm')}
                </Button>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!allowClear || !value}
              onClick={() => {
                onValueChange('')
                setOpen(false)
              }}
            >
              {t('dateControl.clear')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!inRange(localToday())}
              onClick={() =>
                mode === 'datetime-local' ? setCursor(localToday()) : commit(localToday())
              }
            >
              {t('dateControl.today')}
            </Button>
          </div>
          <p id={uniqueId} className="sr-only">
            {t('dateControl.keyboard')}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Keep partially typed years local until blur/Enter; do not snap each keystroke to minYear. */
function YearField({
  value,
  min,
  max,
  onCommit,
  'aria-label': label,
}: {
  value: number
  min: number
  max: number
  onCommit: (year: number) => void
  'aria-label': string
}) {
  const [draft, setDraft] = useState(String(value))
  return (
    <Input
      type="number"
      aria-label={label}
      className="w-24 shrink-0 tabular-nums"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onBlur={() => {
        const next = Number(draft)
        if (Number.isInteger(next) && next >= min && next <= max) onCommit(next)
        else setDraft(String(value))
      }}
    />
  )
}
