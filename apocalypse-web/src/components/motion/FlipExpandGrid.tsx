import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useId, useState, type HTMLAttributes, type ReactNode } from 'react'

import { insightMotion, motionTransition } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { cn } from '@/lib/utils'

export interface FlipExpandGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional LayoutGroup identifier for coordinating neighbor yield across cards. */
  groupId?: string
  children: ReactNode
}

/**
 * Skeleton C: Ordered expand grid container.
 * Uses natural row flow (`align-items: start`) so expanded cards span `1 / -1`
 * without `dense` backfilling reordering interactive DOM/tab order.
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
 * Channel 3 (0–240ms): Ordered expand card with exit-width lock:
 * 1. Holds full-row span (`data-exiting="true"`) until collapse animation completes (no narrow-column crush).
 * 2. Smooth vertical panel reveal without cross-column diagonal box collisions.
 * 3. Dynamic `z-index` lock (`3` expanded, `2` exiting/transitioning, `1` idle).
 * 4. `overflow: hidden` radius clipping isolation.
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
  const [exiting, setExiting] = useState(false)
  const [prevExpanded, setPrevExpanded] = useState(expanded)

  if (prevExpanded !== expanded) {
    setPrevExpanded(expanded)
    if (motionEnabled) {
      setTransitioning(true)
      setExiting(!expanded)
    } else {
      setTransitioning(false)
      setExiting(false)
    }
  }

  return (
    <motion.article
      data-slot="flip-expand-card"
      data-card-id={id}
      data-expanded={expanded ? 'true' : 'false'}
      data-exiting={exiting ? 'true' : undefined}
      data-transitioning={transitioning ? 'true' : undefined}
      className={cn('flip-expand-card', className)}
    >
      <div data-slot="flip-expand-summary">{summary}</div>
      <AnimatePresence
        initial={false}
        onExitComplete={() => {
          setExiting(false)
          setTransitioning(false)
        }}
      >
        {expanded && expandedContent != null && (
          <motion.div
            key="expanded-panel"
            data-slot="flip-expand-panel"
            initial={motionEnabled ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={
              motionEnabled
                ? { height: 0, opacity: 0, transition: motionTransition.exit }
                : { height: 0, opacity: 0 }
            }
            transition={motionEnabled ? motionTransition.standard : insightMotion.instant}
            onAnimationComplete={() => {
              if (expanded) setTransitioning(false)
            }}
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
