import { frontSurfaceZ, type Point3 } from './shape'

export interface Gaze {
  x: number
  y: number
}
export const GAZE = { maxX: 0.085, maxY: 0.05, settlingTime: 0.13 } as const
const bounded = (value: number, limit = 1) =>
  Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0

/** Coordinates are normalized against the visible canvas, not the window or a floating face layer. */
export function gazeTarget(x: number, y: number): Gaze {
  return { x: bounded(x), y: bounded(y) }
}

export function advanceGaze(current: Gaze, target: Gaze, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return
  const amount = 1 - Math.exp(-Math.max(0, Math.min(seconds, 1 / 15)) / GAZE.settlingTime)
  current.x += (bounded(target.x) - current.x) * amount
  current.y += (bounded(target.y) - current.y) * amount
}

export const BUBBLE_MOTION = { bottom: 0.14, top: 1.7, fadeDistance: 0.18 } as const

const halfWidthAt = (y: number) => {
  const ny = 2 * (y / 1.92) ** (1 / 1.2) - 1
  return 1.3 * (1 - 0.08 * ny) * Math.sqrt(Math.max(0, 1 - ny * ny))
}

/** Rebirth happens only after a bubble has become invisible, never as a visible teleport. */
export function bubbleVisibility(y: number) {
  const edge = Math.min(y - BUBBLE_MOTION.bottom, BUBBLE_MOTION.top - y)
  const value = Math.max(0, Math.min(1, (edge - 0.025) / BUBBLE_MOTION.fadeDistance))
  return value * value * (3 - 2 * value)
}

/** Gentle buoyant rise, not a closed orbit. All coordinates stay inside the volume. */
export function bubblePoint(
  rest: Point3,
  radius: number,
  index: number,
  seconds: number,
  out: Point3,
): Point3 {
  const phase = index * 2.399963
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const height = BUBBLE_MOTION.top - BUBBLE_MOTION.bottom
  const speed = 0.019 + (index % 11) * 0.0012
  out.y =
    BUBBLE_MOTION.bottom +
    ((((rest.y - BUBBLE_MOTION.bottom + time * speed) % height) + height) % height)
  const lane = rest.x / Math.max(0.1, halfWidthAt(rest.y))
  const halfWidth = halfWidthAt(out.y)
  const sway = (Math.sin(time * 0.23 + phase) - Math.sin(phase)) * 0.009
  out.x = bounded(lane * halfWidth + sway, Math.max(0.1, halfWidth - radius * 3))
  const depth = bounded(rest.z / Math.max(0.1, frontSurfaceZ(rest.x, rest.y)), 0.78)
  const surface = frontSurfaceZ(out.x, out.y)
  out.z = bounded(surface * depth, Math.max(0, surface - radius * 1.5))
  return out
}
