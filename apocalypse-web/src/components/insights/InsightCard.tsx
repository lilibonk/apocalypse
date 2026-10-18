import type { ReactNode } from 'react'
import { motion } from 'motion/react'

import { insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'
import { cn } from '@/lib/utils'

import './insights.css'

interface InsightCardProps {
  children: ReactNode
  className?: string
  order?: number
  motionEnabled?: boolean
  id?: string
  'aria-labelledby'?: string
}

export function InsightCard({
  children,
  className,
  order = 0,
  motionEnabled,
  ...attributes
}: InsightCardProps) {
  const preference = useMotionPreference()
  const enabled = preference && motionEnabled !== false
  const controls = useSurfaceAnimation({ opacity: 1, y: 0 }, enabled, {
    ...insightMotion.surface,
    delay: order * insightMotion.stagger,
  })

  return (
    <motion.section
      {...attributes}
      className={cn('insight-card', className)}
      initial={enabled ? { opacity: 0, y: insightMotion.enterOffset } : false}
      animate={controls}
    >
      {children}
    </motion.section>
  )
}
