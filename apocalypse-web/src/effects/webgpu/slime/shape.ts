/** Rest shape in world units. Pure maths, shared by skin and face anchors. */
export interface Point3 {
  x: number
  y: number
  z: number
}

export function restPoint(nx: number, ny: number, nz: number): Point3 {
  const theta = Math.acos(Math.max(-1, Math.min(1, ny)))
  const radial = Math.sin(theta)
  const radius = radial ** 0.82 * (1 - 0.07 * ny)
  const scale = radial > 0.00001 ? radius / radial : 0
  return {
    x: nx * 1.66 * scale,
    y: 0.035 + 2.36 * ((ny + 1) / 2) ** 1.28 + 0.42 * Math.exp((-theta * theta) / 0.055),
    z: nz * 1.18 * scale,
  }
}

export function radiusAt(y: number) {
  const t = Math.max(0, Math.min(1, (y - 0.035) / 2.36)) ** (1 / 1.28)
  const c = t * 2 - 1
  return Math.sqrt(Math.max(0, 1 - c * c)) ** 0.82 * (1 - 0.07 * c)
}

/** Front skin height: face geometry is authored directly on this same ellipsoid. */
export function frontSurfaceZ(x: number, y: number): number {
  const r = radiusAt(y)
  return 1.18 * Math.sqrt(Math.max(0, r * r - (x / 1.66) ** 2))
}

/** Fixed seed: no layout jumps after StrictMode mount, theme changes or screenshot capture. */
export function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}
