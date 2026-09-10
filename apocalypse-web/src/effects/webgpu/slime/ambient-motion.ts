/** Adapted from yuanyang749/softie-webgpu, MIT, Copyright (c) 2026 yuanyang749.
 * Source: https://github.com/yuanyang749/softie-webgpu/tree/977a60844ac6ffe6824531900cf15bd5403e408f
 * Changes: TypeScript, Apocalypse host/lifecycle integration. See public/licenses/softie-webgpu.txt.
 */
import { radiusAt, type Point3 } from './shape'
export interface BubbleSeed {
  x: number
  y: number
  z: number
  size: number
  phase: number
}
const smooth = (x: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export function bubblePoint(b: BubbleSeed, time: number, out: Point3 & { scale: number }) {
  const speed = 0.026 + b.size * 0.65 + b.phase * 0.002
  const progress = ((b.y - 0.19 + Math.max(0, time) * speed) % 1.96) / 1.96
  const y = 0.19 + progress * 1.96
  const radius = radiusAt(y)
  const drift = time * (0.5 + b.phase * 0.06)
  let x = b.x + Math.sin(drift + b.phase) * 0.045
  let z = b.z + Math.cos(drift * 0.73 + b.phase) * 0.035
  const inset = Math.max(0, 1 - (b.size * 2.8) / (1.18 * radius))
  const fit = Math.min(1, inset / Math.max(1e-9, Math.hypot(x, z)))
  x *= 1.66 * radius * fit
  z *= 1.18 * radius * fit
  const fade = smooth(progress, 0, 0.08) * (1 - smooth(progress, 0.9, 1))
  out.x = x
  out.y = y
  out.z = z
  out.scale = b.size * Math.max(0.001, fade)
  return out
}
