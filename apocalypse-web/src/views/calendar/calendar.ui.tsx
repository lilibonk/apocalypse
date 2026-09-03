import { FieldSelect, FieldOption } from '@/components/ui/field-select'
import { AlertCircle, CalendarDays } from 'lucide-react'
import { useId, type ReactNode } from 'react'
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
    <div
      data-slot="calendar-page"
      className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 sm:p-6"
    >
      <header className="border-b border-border pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </header>
      {actions && (
        <div
          data-slot="calendar-toolbar"
          className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/40 p-4"
        >
          {actions}
        </div>
      )}
      <div
        data-slot="calendar-workspace"
        className="min-w-0 space-y-5 [&_[data-slot=card]]:min-w-0 [&_[data-slot=card]]:shadow-none [&_[data-slot=card-header]]:border-b [&_[data-slot=card-header]]:border-border [&_[data-slot=card-header]]:pb-4 [&_[data-slot=card-title]]:text-base"
      >
        {children}
      </div>
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
  const id = useId()
  const options = roles
    ? calendars.filter((calendar) => roles.includes(calendar.currentUserRole))
    : calendars
  return (
    <div className="grid w-full min-w-0 gap-1.5 sm:w-72">
      <Label htmlFor={id}>{label ?? t('businessCalendar')}</Label>
      <FieldSelect
        id={id}
        disabled={options.length === 0}
        value={value}
        onValueChange={(selection) => onChange(selection)}
      >
        <FieldOption value="">
          {options.length ? t('selectCalendar') : t('noAvailableCalendar')}
        </FieldOption>
        {options.map((calendar) => (
          <FieldOption key={calendar.id} value={calendar.id}>
            {calendar.name}
          </FieldOption>
        ))}
      </FieldSelect>
    </div>
  )
}

export function StateBadge({ value }: { value: string }) {
  const { t } = useTranslation('calendar')
  const destructive = ['OPEN', 'NEEDS_REVIEW', 'CANCELLED', 'ARCHIVED'].includes(value)
  const secondary = ['DRAFT', 'WITHDRAWN', 'INACTIVE', 'UNPUBLISHED'].includes(value)
  return (
    <Badge variant={destructive ? 'destructive' : secondary ? 'secondary' : 'outline'}>
      {t(`states.${value}`, { defaultValue: t('unknownState') })}
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

export function CalendarTrace({ children }: { children: ReactNode }) {
  const { t } = useTranslation('calendar')
  return (
    <details className="rounded-md border border-border p-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium">{t('technicalDetails')}</summary>
      <div className="mt-3 space-y-2 break-all">{children}</div>
    </details>
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
    <div className="grid gap-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-2">
      <div className="text-sm font-medium sm:col-span-2">{label}</div>
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
