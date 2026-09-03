import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { cn } from '@/lib/utils'

// Radix reserves an empty value. Keep the empty-string business contract at this boundary.
const EMPTY = '__field_select_empty__'

export function FieldSelect({
  value,
  onValueChange,
  children,
  id,
  disabled,
  className,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  id?: string
  disabled?: boolean
  className?: string
  placeholder?: string
  'aria-label'?: string
}) {
  const { t } = useTranslation()
  return (
    <Select
      value={value || EMPTY}
      onValueChange={(next) => onValueChange(next === EMPTY ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('w-full min-w-0', className)}>
        <SelectValue placeholder={placeholder ?? t('dateControl.select')} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {children}
      </SelectContent>
    </Select>
  )
}

export function FieldOption({
  value,
  children,
  disabled,
}: {
  value: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <SelectItem value={value || EMPTY} disabled={disabled}>
      {children}
    </SelectItem>
  )
}
