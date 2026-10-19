/** Viewport rectangle of the element a detail layer was opened from. */
export interface OriginRect {
  top: number
  left: number
  width: number
  height: number
}

export function originOf(element: Element | null | undefined): OriginRect | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  const visible =
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  return visible ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null
}

/**
 * Transform that maps a target box onto the origin box (transform-origin: top left). The ghost is
 * laid out at its target and animates from this transform to identity, so only transform/opacity
 * change and layout never thrashes.
 */
export function ghostTransform(origin: OriginRect, target: OriginRect): string {
  const scaleX = target.width > 0 ? origin.width / target.width : 1
  const scaleY = target.height > 0 ? origin.height / target.height : 1
  const x = origin.left - target.left
  const y = origin.top - target.top
  return `translate(${round(x)}px, ${round(y)}px) scale(${round(scaleX, 4)}, ${round(scaleY, 4)})`
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
