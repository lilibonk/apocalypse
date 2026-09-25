/** Rest shape in world units. Pure maths, shared by skin and face anchors. */
export interface Point3 {
  x: number
  y: number
  z: number
}

export const BODY_WIDTH = 1.56
export const BODY_DEPTH = 1.18
export const BODY_TOP = 2.785
export const FACE_X = -0.28

export function restPoint(nx: number, ny: number, nz: number): Point3 {
  const theta = Math.acos(Math.max(-1, Math.min(1, ny)))
  const radial = Math.sin(theta)
  const radius = radial ** 0.72 * (1 - 0.07 * ny)
  const scale = radial > 0.00001 ? radius / radial : 0
  return {
    x: nx * BODY_WIDTH * scale,
    y: 0.035 + 2.75 * ((ny + 1) / 2) ** 1.18,
    z: nz * BODY_DEPTH * scale,
  }
}

export function radiusAt(y: number) {
  const t = Math.max(0, Math.min(1, (y - 0.035) / 2.75)) ** (1 / 1.18)
  const c = t * 2 - 1
  return Math.sqrt(Math.max(0, 1 - c * c)) ** 0.72 * (1 - 0.07 * c)
}

/** Front skin height: face geometry is authored directly on this same ellipsoid. */
export function frontSurfaceZ(x: number, y: number): number {
  const r = radiusAt(y)
  return BODY_DEPTH * Math.sqrt(Math.max(0, r * r - (x / BODY_WIDTH) ** 2))
}

/** Fixed seed: no layout jumps after StrictMode mount, theme changes or screenshot capture. */
export function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}
