import { motion } from 'motion/react'

import { coupledMotion, insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { cn } from '@/lib/utils'

export type PulseTone = 'gold' | 'purple' | 'mint' | 'primary'

export interface PathPulseProps {
  /** SVG path `d` attribute. */
  d: string
  /** Whether this edge belongs to the currently selected causal chain. */
  active?: boolean
  /**
   * Monotonic trigger key or sequence number. A one-shot 420ms pulse is emitted only when
   * `active` is true and `triggerKey` changes (or is non-null). Zero idle requestAnimationFrame.
   */
  triggerKey?: string | number | null
  /**Alias for `triggerKey` compatibility with existing graph callers. */
  pulseKey?: string | number | null
  /** Semantic color tone: 'gold' (dept/all-scope), 'purple' (role->perm), 'mint' (role->menu), 'primary'. */
  tone?: PulseTone
  strokeWidth?: number
  motionEnabled?: boolean
  className?: string
  pulseClassName?: string
}

/**
 * Channel 2 (0–420ms): One-shot SVG path pulse along the active causal edge.
 * Settles into a static highlighted path with zero idle rAF overhead.
 */
export function PathPulse({
  d,
  active = false,
  triggerKey,
  pulseKey,
  tone = 'gold',
  strokeWidth = 1.75,
  motionEnabled,
  className,
  pulseClassName,
}: PathPulseProps) {
  const preference = useMotionPreference()
  const animate = motionEnabled ?? preference
  const resolvedKey = triggerKey ?? pulseKey

  return (
    <g data-slot="path-pulse" data-active={active ? 'true' : 'false'} data-tone={tone}>
      <path
        d={d}
        strokeWidth={strokeWidth}
        data-active={active ? 'true' : 'false'}
        data-tone={tone}
        className={cn('path-pulse-base', className)}
      />
      {active && animate && resolvedKey != null && resolvedKey !== 0 && (
        <motion.path
          key={String(resolvedKey)}
          d={d}
          strokeWidth={strokeWidth + 1.1}
          pathLength={1}
          strokeDasharray="0.26 1"
          initial={{ strokeDashoffset: 1, opacity: 0.96 }}
          animate={{ strokeDashoffset: -0.26, opacity: 0 }}
          transition={animate ? coupledMotion.pulse : insightMotion.instant}
          data-slot="path-pulse-traveller"
          data-tone={tone}
          className={cn('path-pulse-traveller', pulseClassName)}
        />
      )}
    </g>
  )
}
