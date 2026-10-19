import type { ComponentType, SVGProps } from 'react'

import { cn } from '@/lib/utils'

export interface SegmentedOption<Value extends string> {
  value: Value
  label: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  /** Optional count shown after the label (e.g. relation sizes). */
  count?: number | null
}

/**
 * One switch shape for every view or relation choice (list/overview, graph/list, cards/list,
 * role relations). Same height and track as TabsList; buttons keep `aria-pressed` so the choice is
 * announced and testable. It changes what is shown, never performs a business action.
 */
export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string
  value: Value
  options: readonly SegmentedOption<Value>[]
  onChange: (value: Value) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="segmented-control"
      className={cn(
        'inline-flex h-9 w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-control bg-muted p-1',
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon
        const pressed = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => !pressed && onChange(option.value)}
            className={cn(
              'inline-flex h-full shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
              pressed
                ? 'bg-card text-foreground shadow-surface'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon aria-hidden="true" className="size-4" />}
            {option.label}
            {option.count !== undefined && option.count !== null && (
              <span className="text-xs text-muted-foreground tabular-nums">{option.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
