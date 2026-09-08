import type { OrbState } from '@/effects/PixelOrb/types'

import { frontSurfaceZ, type Point3 } from './shape'
import { GAZE, type Gaze } from './ambient-motion'

export function eyePoint(
  point: Point3,
  state: OrbState,
  blink: number,
  gaze: Gaze = { x: 0, y: 0 },
): Point3 {
  const oldZ = frontSurfaceZ(point.x, point.y)
  const centerX = point.x < 0 ? -0.42 : 0.42
  const dx = (point.x - centerX) / 0.108
  const closed = state === 'sleeping' ? 1 : blink
  const openness = (state === 'success' ? 0.7 : 1) * (1 - closed * 0.9)
  const following = state === 'idle'
  const x = point.x + (following ? gaze.x * GAZE.maxX : 0)
  const y =
    0.98 +
    (point.y - 0.98) * openness +
    closed * 0.013 * (1 - dx * dx) +
    (following ? gaze.y * GAZE.maxY : 0)
  return { x, y, z: frontSurfaceZ(x, y) + point.z - oldZ }
}

/** Tube rings stay on the actual front surface for every expression. */
export function mouthPoint(u: number, v: number, state: OrbState): Point3 {
  const angle = Math.PI * 2 * v
  let x: number
  let y: number
  let tx: number
  let ty: number
  if (state === 'waiting') {
    const theta = u * Math.PI * 2
    x = 0.033 * Math.cos(theta)
    y = 0.868 + 0.04 * Math.sin(theta)
    tx = -Math.sin(theta) * 0.033
    ty = Math.cos(theta) * 0.04
  } else {
    const width = state === 'success' ? 0.29 : state === 'sleeping' ? 0.12 : 0.24
    const depth = state === 'error' ? -0.042 : state === 'success' ? 0.08 : 0.05
    x = (u - 0.5) * width
    y = 0.89 - Math.sin(Math.PI * u) * depth
    tx = width
    ty = -Math.cos(Math.PI * u) * depth * Math.PI
  }
  const length = Math.hypot(tx, ty)
  x += (-ty / length) * Math.cos(angle) * 0.01
  y += (tx / length) * Math.cos(angle) * 0.01
  return { x, y, z: frontSurfaceZ(x, y) + Math.sin(angle) * 0.01 + 0.025 }
}
