import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type StageBackdrop = 'dots' | 'grid' | 'plain'

export interface SpatialStageProps extends HTMLAttributes<HTMLDivElement> {
  /** Canvas backdrop texture: defaults to 'dots' (matching reference frames 0699 & 0814). */
  backdrop?: StageBackdrop
  /** Fill the available single-screen viewport height (`calc(var(--shell-viewport-h) - 2 * var(--shell-stage-pad))`). */
  fullViewport?: boolean
  /** Minimum height fallback so ultra-short windows never collapse the stage. */
  minHeight?: string
  /** Primary stage canvas content (e.g., ZoomPanCanvas or SVG graph). */
  children: ReactNode
  /** Four-corner and right-inspector FloatingHud overlays. */
  hud?: ReactNode
}

type StageStyle = CSSProperties & {
  '--spatial-stage-min-h'?: string
}

/**
 * Skeleton A: Full-bleed spatial canvas stage with an overlay grid for corner-anchored FloatingHud cards.
 * Empty areas of the HUD layer pass pointer events directly through to the canvas.
 */
export function SpatialStage({
  backdrop = 'dots',
  fullViewport = true,
  minHeight = '36rem',
  children,
  hud,
  className,
  style,
  ...rest
}: SpatialStageProps) {
  const stageStyle: StageStyle = {
    ...style,
    '--spatial-stage-min-h': minHeight,
  }

  return (
    <section
      data-slot="spatial-stage"
      data-backdrop={backdrop}
      data-full-viewport={fullViewport ? 'true' : 'false'}
      style={stageStyle}
      className={cn('spatial-stage', className)}
      {...rest}
    >
      <div data-slot="spatial-stage-canvas" className="spatial-stage-canvas">
        {children}
      </div>
      {hud != null && (
        <div data-slot="spatial-stage-hud-layer" className="spatial-stage-hud-layer">
          {hud}
        </div>
      )}
    </section>
  )
}
