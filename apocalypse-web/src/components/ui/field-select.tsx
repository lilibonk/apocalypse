import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { cn } from '@/lib/utils'

// Radix reserves an empty value. Keep the empty-string business contract at this boundary.
const EMPTY = '__field_select_empty__'

type FieldSelectProps = Omit<
  ComponentProps<typeof SelectTrigger>,
  'value' | 'defaultValue' | 'onChange' | 'children'
> & {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  placeholder?: string
}

export function FieldSelect({
  value,
  onValueChange,
  children,
  disabled,
  className,
  placeholder,
  ...triggerProps
}: FieldSelectProps) {
  const { t } = useTranslation()
  return (
    <Select
      value={value || EMPTY}
      onValueChange={(next) => onValueChange(next === EMPTY ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger {...triggerProps} className={cn('w-full min-w-0', className)}>
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
