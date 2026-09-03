import { AlertCircle, CalendarDays } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import type { CalendarRecord } from './calendar.api'

export function CalendarPageFrame({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="w-full space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

export function CalendarPicker({
  calendars,
  value,
  onChange,
  label,
  roles,
}: {
  calendars: CalendarRecord[]
  value: string
  onChange: (value: string) => void
  label?: string
  roles?: CalendarRecord['currentUserRole'][]
}) {
  const { t } = useTranslation('calendar')
  const options = roles
    ? calendars.filter((calendar) => roles.includes(calendar.currentUserRole))
    : calendars
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="calendar-context">{label ?? t('businessCalendar')}</Label>
      <select
        id="calendar-context"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-52 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">{t('selectCalendar')}</option>
        {options.map((calendar) => (
          <option key={calendar.id} value={calendar.id}>
            {calendar.name} · {calendar.calendarKey}
          </option>
        ))}
      </select>
    </div>
  )
}

export function StateBadge({ value }: { value: string }) {
  const { t } = useTranslation('calendar')
  const destructive = ['OPEN', 'NEEDS_REVIEW', 'CANCELLED', 'ARCHIVED'].includes(value)
  const secondary = ['DRAFT', 'WITHDRAWN', 'INACTIVE', 'UNPUBLISHED'].includes(value)
  return (
    <Badge variant={destructive ? 'destructive' : secondary ? 'secondary' : 'outline'}>
      {t(`states.${value}`, { defaultValue: value })}
    </Badge>
  )
}

export function DataEmpty({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('calendar')
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      <CalendarDays className="size-6" aria-hidden="true" />
      <p>{children ?? t('noData')}</p>
    </div>
  )
}

export function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

export function FieldPair({
  label,
  baseline,
  effective,
}: {
  label: string
  baseline: string | null | undefined
  effective: string | null | undefined
}) {
  const { t } = useTranslation('calendar')
  const changed = (baseline ?? '') !== (effective ?? '')
  return (
    <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[8rem_1fr_1fr]">
      <div className="text-sm font-medium">{label}</div>
      <div>
        <div className="text-xs text-muted-foreground">{t('systemBaseline')}</div>
        <div className="mt-1 text-sm">{baseline || '—'}</div>
      </div>
      <div className={cn(changed && 'text-primary')}>
        <div className="text-xs text-muted-foreground">{t('effectiveValue')}</div>
        <div className="mt-1 text-sm font-medium">{effective || '—'}</div>
      </div>
    </div>
  )
}
