/** Rest shape in world units. Pure maths, shared by skin and face anchors. */
export interface Point3 {
  x: number
  y: number
  z: number
}

export function restPoint(nx: number, ny: number, nz: number): Point3 {
  return {
    x: nx * 1.3 * (1 - 0.08 * ny),
    y: Math.max(0.04, 1.92 * ((ny + 1) / 2) ** 1.2),
    z: nz * 1.02 * (1 - 0.1 * ny),
  }
}

/** Front skin height: face geometry is authored directly on this same ellipsoid. */
export function frontSurfaceZ(x: number, y: number): number {
  const ny = 2 * (Math.max(0, y) / 1.92) ** (1 / 1.2) - 1
  const nx = x / (1.3 * (1 - 0.08 * ny))
  return Math.sqrt(Math.max(0, 1 - ny * ny - nx * nx)) * 1.02 * (1 - 0.1 * ny)
}

/** Fixed seed: no layout jumps after StrictMode mount, theme changes or screenshot capture. */
export function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}
