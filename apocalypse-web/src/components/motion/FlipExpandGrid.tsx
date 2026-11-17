import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useId, useState, type HTMLAttributes, type ReactNode } from 'react'

import { coupledMotion, insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { cn } from '@/lib/utils'

export interface FlipExpandGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional LayoutGroup identifier for coordinating neighbor yield across cards. */
  groupId?: string
  children: ReactNode
}

/**
 * Skeleton C: Single-boundary FLIP expand grid container.
 * Enforces `grid-auto-flow: dense` and `align-items: start` so expanded cards span `1 / -1`
 * while neighboring cards yield smoothly via pure position translation.
 */
export function FlipExpandGrid({ groupId, className, children, ...rest }: FlipExpandGridProps) {
  const fallbackId = useId()
  return (
    <LayoutGroup id={groupId ?? fallbackId}>
      <div data-slot="flip-expand-grid" className={cn('flip-expand-grid', className)} {...rest}>
        {children}
      </div>
    </LayoutGroup>
  )
}

export interface FlipExpandCardProps {
  /** Stable identifier of the card. */
  id: string
  /** Whether the card is expanded across the full grid row (`grid-column: 1 / -1`). */
  expanded: boolean
  /** Summary header/preview always rendered in both collapsed and expanded states. */
  summary: ReactNode
  /** Detail body mounted only when `expanded` is true, animated with height/opacity. */
  expandedContent?: ReactNode
  /** Optional footer always rendered at the bottom of the card. */
  footer?: ReactNode
  className?: string
  expandedPanelClassName?: string
  onToggle?: () => void
}

/**
 * Channel 3 (0–380ms): Single-boundary FLIP card implementing the 5 strict geometry rules:
 * 1. No card-level `container-type: inline-size`.
 * 2. Single root `layout="position"` (zero child `layout` nesting, preventing text distortion).
 * 3. Explicit height/opacity transition on `.flip-expand-card-panel`.
 * 4. Dynamic `z-index` lock (`3` expanded, `2` transitioning, `1` idle) preventing neighbor overlap.
 * 5. `overflow: hidden` radius clipping isolation.
 */
export function FlipExpandCard({
  id,
  expanded,
  summary,
  expandedContent,
  footer,
  className,
  expandedPanelClassName,
}: FlipExpandCardProps) {
  const motionEnabled = useMotionPreference()
  const [transitioning, setTransitioning] = useState(false)
  const [prevExpanded, setPrevExpanded] = useState(expanded)

  if (prevExpanded !== expanded) {
    setPrevExpanded(expanded)
    if (motionEnabled) {
      setTransitioning(true)
    }
  }

  return (
    <motion.article
      layout={motionEnabled ? 'position' : false}
      transition={motionEnabled ? coupledMotion.flip : insightMotion.instant}
      onLayoutAnimationComplete={() => setTransitioning(false)}
      data-slot="flip-expand-card"
      data-card-id={id}
      data-expanded={expanded ? 'true' : 'false'}
      data-transitioning={transitioning ? 'true' : undefined}
      className={cn('flip-expand-card', className)}
    >
      <div data-slot="flip-expand-summary">{summary}</div>
      <AnimatePresence initial={false}>
        {expanded && expandedContent != null && (
          <motion.div
            key="expanded-panel"
            data-slot="flip-expand-panel"
            initial={motionEnabled ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={motionEnabled ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
            transition={motionEnabled ? coupledMotion.flip : insightMotion.instant}
            className={cn('overflow-hidden', expandedPanelClassName)}
          >
            {expandedContent}
          </motion.div>
        )}
      </AnimatePresence>
      {footer != null && <div data-slot="flip-expand-footer">{footer}</div>}
    </motion.article>
  )
}
