import type { ReactNode } from 'react'
import { motion } from 'motion/react'

import { insightMotion, stateMotion } from '@/design/motion'
import { useFirstEntrance } from '@/hooks/useFirstEntrance'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'
import { cn } from '@/lib/utils'

import './insights.css'

interface InsightCardProps {
  children: ReactNode
  className?: string
  order?: number
  motionEnabled?: boolean
  /**
   * Surface identity for first-entrance memory. With a key the "bounce home" entrance plays once per
   * identity/authorization epoch; returning to the page lands on the final state. Without a key the
   * card keeps the previous behaviour and enters on every mount.
   */
  entranceKey?: string
  /** @deprecated Native themes style `.insight-card` directly without overlaid SVG strokes. */
  sketchSeed?: number
  wash?: 'none' | 'normal' | 'wide'
  conduitAnchor?: string
  id?: string
  'aria-labelledby'?: string
}

export function InsightCard({
  children,
  className,
  order = 0,
  motionEnabled,
  entranceKey,
  wash = 'none',
  conduitAnchor,
  ...attributes
}: InsightCardProps) {
  const preference = useMotionPreference()
  const first = useFirstEntrance(entranceKey)
  const enabled = preference && motionEnabled !== false
  const entering = enabled && first
  const controls = useSurfaceAnimation({ opacity: 1, y: 0, scale: 1 }, enabled, {
    ...(entranceKey ? stateMotion.entrance : insightMotion.surface),
    delay: order * insightMotion.stagger,
  })

  return (
    <motion.section
      {...attributes}
      data-conduit-anchor={conduitAnchor}
      className={cn('insight-card sketch-surface', className)}
      initial={
        entering
          ? {
              opacity: 0,
              y: insightMotion.enterOffset,
              scale: entranceKey ? stateMotion.entranceScale : 1,
            }
          : false
      }
      animate={controls}
    >
      {wash !== 'none' && <div className="wash-layer" data-wash={wash} aria-hidden="true" />}
      {children}
    </motion.section>
  )
}
