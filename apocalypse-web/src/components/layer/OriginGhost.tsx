import type { CSSProperties } from 'react'

import { ghostTransform, type OriginRect } from './origin'

/**
 * Decorative ghost that travels from a source row to the edge of a detail layer. It never holds
 * content: the real layer enters with its standard motion and is fully readable from its first
 * frame. Hidden from assistive technology and transparent to pointer input.
 */
export function OriginGhost({
  origin,
  target,
  onDone,
}: {
  origin: OriginRect
  target: OriginRect
  onDone: () => void
}) {
  const style = {
    top: target.top,
    left: target.left,
    width: target.width,
    height: target.height,
    '--origin-ghost-from': ghostTransform(origin, target),
  } as CSSProperties
  return (
    <div
      aria-hidden="true"
      data-slot="origin-ghost"
      className="origin-ghost"
      style={style}
      onAnimationEnd={onDone}
    />
  )
}
