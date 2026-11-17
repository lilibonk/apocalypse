import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'

import { buildSketchPaths } from '@/components/motion'
import { insightMotion, stateMotion } from '@/design/motion'
import { useFirstEntrance } from '@/hooks/useFirstEntrance'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

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
  sketchSeed,
  wash = 'none',
  conduitAnchor,
  ...attributes
}: InsightCardProps) {
  const { themeWorld } = useSettings()
  const preference = useMotionPreference()
  const first = useFirstEntrance(entranceKey)
  const enabled = preference && motionEnabled !== false
  const entering = enabled && first
  const controls = useSurfaceAnimation({ opacity: 1, y: 0, scale: 1 }, enabled, {
    ...(entranceKey ? stateMotion.entrance : insightMotion.surface),
    delay: order * insightMotion.stagger,
  })
  const cardRef = useRef<HTMLElement>(null)
  const isSketchbook = themeWorld === 'sketchbook' && sketchSeed !== undefined
  const [bounds, setBounds] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!isSketchbook) return
    const element = cardRef.current
    if (!element) return

    const sync = () => {
      const nextW = element.offsetWidth
      const nextH = element.offsetHeight
      setBounds((prev) =>
        prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH },
      )
    }

    const frame = window.requestAnimationFrame(sync)
    if (typeof ResizeObserver === 'undefined') {
      return () => window.cancelAnimationFrame(frame)
    }
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [isSketchbook])

  const paths = useMemo(
    () =>
      isSketchbook && sketchSeed !== undefined
        ? buildSketchPaths(bounds.width, bounds.height, sketchSeed)
        : null,
    [bounds.height, bounds.width, isSketchbook, sketchSeed],
  )

  return (
    <motion.section
      ref={cardRef}
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
      {isSketchbook && paths && paths.primary && (
        <svg
          className="sketch-border-svg"
          viewBox={`0 0 ${bounds.width} ${bounds.height}`}
          aria-hidden="true"
        >
          <path
            d={paths.primary}
            fill="none"
            stroke="var(--sketch-ink)"
            strokeWidth={1.55}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.84}
          />
          <path
            d={paths.secondary}
            fill="none"
            stroke="var(--sketch-ink)"
            strokeWidth={0.95}
            strokeLinecap="round"
            opacity={0.36}
          />
        </svg>
      )}
      {children}
    </motion.section>
  )
}
