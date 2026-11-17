import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { useCoupledMotion } from './CoupledMotionGroup'

export interface OriginAnchorProps extends HTMLAttributes<HTMLElement> {
  /** Unique identifier of this trigger row/card/node. */
  originId?: string
  /** Explicit active override; falls back to CoupledMotionGroup.activeOriginId === originId. */
  active?: boolean
  /** Element tag to render ('div' | 'tr' | 'li' | 'article' | 'section'). Defaults to 'div'. */
  as?: 'div' | 'tr' | 'li' | 'article' | 'section'
  children: ReactNode
}

/**
 * Channel 1 (0–150ms): Locks `data-origin-active="true"` on the trigger row, card, or node
 * while its coupled inspector/HUD or path pulse is active.
 */
export function OriginAnchor({
  originId,
  active,
  as = 'div',
  className,
  children,
  ...rest
}: OriginAnchorProps) {
  const coupled = useCoupledMotion()
  const isActive = active ?? (originId != null && coupled.activeOriginId === originId)
  const Tag = as as 'div'

  return (
    <Tag
      data-slot="origin-anchor"
      data-origin-id={originId}
      data-origin-active={isActive ? 'true' : undefined}
      className={cn('transition-colors duration-150', className)}
      {...rest}
    >
      {children}
    </Tag>
  )
}
