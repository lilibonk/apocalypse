import type { CSSProperties } from 'react'

import { useMotionPreference } from '@/hooks/useMotionPreference'
import { cn } from '@/lib/utils'

export type PulseIndicatorVariant = 'inline' | 'card' | 'page'
export type PulseIndicatorTone = 'brand' | 'current'

export interface PulseIndicatorProps {
  /** inline = button/pill; card = section loading; page = route loading. */
  variant?: PulseIndicatorVariant
  /** brand uses --primary; current inherits parent text color. */
  tone?: PulseIndicatorTone
  /** false renders a static rhythm for settled/paused states. */
  active?: boolean
  /** Accessible status label; when omitted, rendered as decorative aria-hidden. */
  label?: string
  className?: string
}

const BAR_COUNT: Record<PulseIndicatorVariant, number> = {
  inline: 6,
  card: 12,
  page: 16,
}

const LEVELS = [0.34, 0.58, 0.82, 0.46, 1, 0.7, 0.42, 0.88] as const

const WRAP_CLASS: Record<PulseIndicatorVariant, string> = {
  inline: 'h-4 gap-0.5',
  card: 'h-6 gap-1',
  page: 'h-12 gap-1',
}

const BAR_CLASS: Record<PulseIndicatorVariant, string> = {
  inline: 'w-0.5',
  card: 'w-1',
  page: 'w-2',
}

type BarStyle = CSSProperties & {
  '--pixel-scale-index': number
  '--pixel-scale-level': number
}

/**
 * Semantic rounded pulse indicator the single waiting-feedback primitive.
 * Strictly honors `useMotionPreference()` (`settings.motionEnabled && !prefers-reduced-motion`).
 */
export function PulseIndicator({
  variant = 'card',
  tone = 'brand',
  active = true,
  label,
  className,
}: PulseIndicatorProps) {
  const motionEnabled = useMotionPreference()
  const count = BAR_COUNT[variant]
  const effectiveActive = active && motionEnabled

  return (
    <div
      role={label ? 'status' : undefined}
      aria-live={label ? 'polite' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-slot="pulse-indicator"
      data-effect="pixel-wave"
      data-appearance="scale"
      data-variant={variant}
      data-active={effectiveActive}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        WRAP_CLASS[variant],
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => {
        const style: BarStyle = {
          '--pixel-scale-index': index,
          '--pixel-scale-level': LEVELS[index % LEVELS.length],
        }
        return (
          <span
            key={index}
            data-slot="pixel-scale-bar"
            className={cn(
              'h-full origin-center rounded-full',
              BAR_CLASS[variant],
              tone === 'current' ? 'bg-current' : 'bg-primary',
            )}
            style={style}
          />
        )
      })}
    </div>
  )
}
