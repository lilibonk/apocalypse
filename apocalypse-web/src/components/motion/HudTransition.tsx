import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { coupledMotion, insightMotion, motionGeometry, stateMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

export interface HudTransitionProps {
  /** Entity identifier or composite key driving the HUD/Inspector content switch. */
  entityKey: string | number
  children: ReactNode
  className?: string
}

/**
 * Channel 4 (0–240ms): Synchronized content switch for FloatingHud and ResponsiveInspector.
 * Keyed by `entityKey` + `sessionEpoch` + `authorizationEpoch` so revoked or switched
 * sessions snap immediately without lingering exit ghosts.
 */
export function HudTransition({ entityKey, children, className }: HudTransitionProps) {
  const motionEnabled = useMotionPreference()
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const compositeKey = `${sessionEpoch}:${authorizationEpoch}:${entityKey}`

  return (
    <motion.div
      key={compositeKey}
      data-slot="hud-transition"
      data-entity-key={String(entityKey)}
      initial={
        motionEnabled ? { opacity: stateMotion.dimOpacity, y: motionGeometry.pageOffset } : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={motionEnabled ? coupledMotion.hud : insightMotion.instant}
      className={cn('min-w-0', className)}
    >
      {children}
    </motion.div>
  )
}
