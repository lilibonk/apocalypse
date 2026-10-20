export interface View {
  x: number
  y: number
  scale: number
}

export const zoomLimits = { min: 0.35, max: 2.5 } as const

export function clampZoom(scale: number) {
  return Math.min(zoomLimits.max, Math.max(zoomLimits.min, scale))
}

/**
 * Fit content into the frame with padding, never enlarging beyond 1 and never shrinking below
 * `minScale` (text must stay readable). Oversized content is centred horizontally and top-aligned,
 * so a centred root stays in view; the rest is reached by panning.
 */
export function fitView(
  frameWidth: number,
  frameHeight: number,
  contentWidth: number,
  contentHeight: number,
  padding = 24,
  minScale: number = zoomLimits.min,
): View {
  if (!frameWidth || !frameHeight || !contentWidth || !contentHeight)
    return { x: 0, y: 0, scale: 1 }
  const fitted = Math.min(
    1,
    (frameWidth - padding * 2) / contentWidth,
    (frameHeight - padding * 2) / contentHeight,
  )
  const scale = clampZoom(Math.max(fitted, minScale))
  const overflowY = contentHeight * scale > frameHeight - padding * 2
  return {
    scale,
    x: (frameWidth - contentWidth * scale) / 2,
    y: overflowY ? padding : (frameHeight - contentHeight * scale) / 2,
  }
}

/** Explicit overview may shrink labels; normal fit and manual zoom retain their readable limits. */
export function fitOverview(
  frameWidth: number,
  frameHeight: number,
  contentWidth: number,
  contentHeight: number,
  padding = 24,
): View {
  if (
    frameWidth <= padding * 2 ||
    frameHeight <= padding * 2 ||
    contentWidth <= 0 ||
    contentHeight <= 0
  )
    return { x: 0, y: 0, scale: 1 }
  const scale = Math.min(
    1,
    (frameWidth - padding * 2) / contentWidth,
    (frameHeight - padding * 2) / contentHeight,
  )
  return {
    scale,
    x: (frameWidth - contentWidth * scale) / 2,
    y: (frameHeight - contentHeight * scale) / 2,
  }
}

/** Smallest pan that brings a content-space box (plus margin) inside the frame; scale unchanged. */
export function panIntoView(
  view: View,
  box: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
  margin = 32,
): View {
  const left = view.x + box.x * view.scale
  const top = view.y + box.y * view.scale
  const right = left + box.width * view.scale
  const bottom = top + box.height * view.scale
  let x = view.x
  let y = view.y
  if (left < margin) x += margin - left
  else if (right > frameWidth - margin) x -= right - (frameWidth - margin)
  if (top < margin) y += margin - top
  else if (bottom > frameHeight - margin) y -= bottom - (frameHeight - margin)
  return x === view.x && y === view.y ? view : { ...view, x, y }
}
