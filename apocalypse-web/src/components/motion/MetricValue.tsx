import { OdometerNumber } from '@/components/insights/OdometerNumber'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { cn } from '@/lib/utils'

export type MetricVariant = 'hero-odometer' | 'tabular'

export interface MetricValueProps {
  value: number | null | undefined
  /**
   * 'tabular' (default): renders a single `<span class="tabular-nums">` with zero extra DOM nodes.
   * 'hero-odometer': mounts the vertical digit reel (strictly reserved for 1–2 primary hero metrics per page).
   */
  variant?: MetricVariant
  format?: (value: number) => string
  /** Fraction digits for the default formatter. */
  decimals?: number
  prefix?: string
  suffix?: string
  language?: 'zh' | 'en'
  motionEnabled?: boolean
  className?: string
}

/**
 * Channel 5 (0–460ms): Strictly tiered numeric readout primitive.
 * Prevents secondary stats from mounting 10-digit odometer DOM strips.
 */
export function MetricValue({
  value,
  variant = 'tabular',
  format,
  decimals,
  prefix = '',
  suffix = '',
  language = 'zh',
  motionEnabled,
  className,
}: MetricValueProps) {
  const preference = useMotionPreference()
  const animate = motionEnabled ?? preference
  const missing = value === null || value === undefined || !Number.isFinite(value)
  const safeValue = missing ? 0 : value
  const locale = language === 'en' ? 'en-US' : 'zh-CN'
  const renderFormatted =
    format ??
    ((next: number) =>
      decimals === undefined
        ? Math.round(next).toLocaleString(locale)
        : next.toLocaleString(locale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }))

  if (missing) {
    return (
      <span
        data-slot="metric-value"
        data-variant="missing"
        className={cn('text-muted-foreground', className)}
      >
        —
      </span>
    )
  }

  if (variant === 'hero-odometer') {
    const formatted = `${prefix}${renderFormatted(safeValue)}${suffix}`
    return <OdometerNumber formatted={formatted} enabled={animate} className={className} />
  }

  return (
    <span
      data-slot="metric-value"
      data-variant="tabular"
      className={cn('tabular-nums transition-opacity duration-150', className)}
    >
      {prefix}
      {renderFormatted(safeValue)}
      {suffix}
    </span>
  )
}
