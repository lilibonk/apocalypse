import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface SketchBoxProps {
  seed?: number
  wash?: 'none' | 'normal' | 'wide'
  /** @deprecated Hand-drawn masking tape overlay has been retired in favor of native CSS themes. */
  washiTape?: boolean
  className?: string
  contentClassName?: string
  'data-conduit-anchor'?: string
  children: ReactNode
}

/**
 * 原生三主题自适应表面容器（`<SketchBox />`）：
 * 不再在卡片之上叠加 SVG 双墨线或贴纸，完全交由 `theme-worlds.css` 原生主题变量与材质驱动。
 */
export function SketchBox({
  wash = 'none',
  className,
  contentClassName,
  'data-conduit-anchor': conduitAnchor,
  children,
}: SketchBoxProps) {
  return (
    <div
      data-slot="sketch-box"
      data-conduit-anchor={conduitAnchor}
      className={cn(
        'sketch-surface rounded-panel border border-border-subtle bg-card text-card-foreground shadow-surface',
        className,
      )}
    >
      {wash !== 'none' && <div className="wash-layer" data-wash={wash} aria-hidden="true" />}
      <div className={cn('crisp-content', contentClassName)}>{children}</div>
    </div>
  )
}
