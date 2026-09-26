/** Rest shape in world units. All face and volume anchors use this same field. */
export interface Point3 {
  x: number
  y: number
  z: number
}

export const BODY_WIDTH = 1.6
export const BODY_DEPTH = 0.96
export const BODY_CENTER_Y = 1.35
export const BODY_TOP = 2.735
export const CROWN = { x: 0.72, y: BODY_TOP, z: 0 } as const
export const FACE_LEFT = { x: -0.33, y: 1.36 } as const
export const FACE_RIGHT = { x: 0.7, y: 1.64 } as const
export const FACE_MOUTH = { x: 0.3, y: 1.418 } as const
export const FACE_EYE_RADIUS = 0.071

const TAU = Math.PI * 2
const CROSS_SECTION_POWER = 2.25
const DEPTH_POWER = 2.15
const OUTLINE_SAMPLES = 2048

// Continuous cubic curves traced from the selected hero silhouette. The sample
// table is radial only for efficient evaluation; it does not define the curves.
const outlineCurves = [
  [747, 90, 837, 84, 877, 142, 884, 240],
  [884, 240, 884, 354, 886, 385, 920, 448],
  [920, 448, 967, 523, 1008, 595, 991, 697],
  [991, 697, 981, 783, 920, 825, 814, 826],
  [814, 826, 741, 828, 657, 805, 581, 817],
  [581, 817, 449, 824, 322, 875, 224, 851],
  [224, 851, 143, 837, 90, 796, 96, 711],
  [96, 711, 95, 645, 128, 590, 132, 552],
  [132, 552, 136, 507, 104, 464, 98, 401],
  [98, 401, 85, 312, 119, 260, 174, 229],
  [174, 229, 223, 196, 282, 203, 345, 211],
  [345, 211, 459, 224, 565, 178, 662, 122],
  [662, 122, 695, 105, 725, 92, 747, 90],
] as const
const traced = outlineCurves
  .flatMap((curve) =>
    Array.from({ length: 192 }, (_, i) => {
      const t = i / 192
      const u = 1 - t
      const x =
        (u ** 3 * curve[0] +
          3 * u * u * t * curve[2] +
          3 * u * t * t * curve[4] +
          t ** 3 * curve[6] -
          545) *
        (3.2 / 903)
      const y =
        (861 -
          (u ** 3 * curve[1] +
            3 * u * u * t * curve[3] +
            3 * u * t * t * curve[5] +
            t ** 3 * curve[7])) *
        (3.2 / 903)
      return {
        angle: (Math.atan2(y - BODY_CENTER_Y, x) + TAU) % TAU,
        radius: Math.hypot(x, y - BODY_CENTER_Y),
      }
    }),
  )
  .sort((a, b) => a.angle - b.angle)
const radii = Float32Array.from({ length: OUTLINE_SAMPLES }, (_, i) => {
  const angle = (i / OUTLINE_SAMPLES) * TAU
  let lo = 0
  let hi = traced.length
  while (lo < hi) {
    const middle = (lo + hi) >>> 1
    if (traced[middle].angle < angle) lo = middle + 1
    else hi = middle
  }
  const before = traced[(lo + traced.length - 1) % traced.length]
  const after = traced[lo % traced.length]
  const a = before.angle - (lo === 0 ? TAU : 0)
  const b = after.angle + (lo === traced.length ? TAU : 0)
  const t = (angle - a) / (b - a)
  return before.radius * (1 - t) + after.radius * t
})

// A narrow, rounded side tuck separates the small rear roll from the inflated
// front. It is part of the same field, so pressing/dragging never opens a seam.
function depthAt(x: number, y: number) {
  const foldX = -1.38 + 0.12 * Math.exp(-(((y - 1.05) / 0.48) ** 2))
  const fold = Math.exp(-(((x - foldX) / 0.09) ** 2) - ((y - 0.6) / 0.58) ** 4)
  const belly = Math.exp(-(((x + 0.4) / 0.85) ** 2) - ((y - 0.7) / 0.8) ** 2)
  const crown = Math.exp(-(((x - 0.62) / 0.7) ** 2) - ((y - 2.08) / 0.55) ** 2)
  return BODY_DEPTH * (1 - 0.5 * fold + 0.22 * belly + 0.18 * crown)
}

function outlineRadius(angle: number) {
  const wrapped = ((angle % TAU) + TAU) % TAU
  const position = (wrapped / TAU) * OUTLINE_SAMPLES
  const index = Math.floor(position)
  const fraction = position - index
  return radii[index] * (1 - fraction) + radii[(index + 1) % OUTLINE_SAMPLES] * fraction
}

export function silhouetteFraction(x: number, y: number) {
  const dy = y - BODY_CENTER_Y
  return Math.hypot(x, dy) / outlineRadius(Math.atan2(dy, x))
}
const surfaceFraction = silhouetteFraction

/** The sphere's direction becomes one continuous, soft square-pillow surface. */
export function restPoint(nx: number, ny: number, nz: number): Point3 {
  const radial = Math.hypot(nx, ny)
  const angle = Math.atan2(ny, nx)
  const extent = outlineRadius(angle) * radial ** (2 / CROSS_SECTION_POWER)
  return {
    x: Math.cos(angle) * extent,
    y: BODY_CENTER_Y + Math.sin(angle) * extent,
    z:
      depthAt(Math.cos(angle) * extent, BODY_CENTER_Y + Math.sin(angle) * extent) *
      Math.sign(nz) *
      Math.abs(nz) ** (2 / DEPTH_POWER),
  }
}

/** Exact front depth of the authored body at any interior XY point. */
export function frontSurfaceZ(x: number, y: number): number {
  const fraction = surfaceFraction(x, y)
  return depthAt(x, y) * Math.max(0, 1 - fraction ** CROSS_SECTION_POWER) ** (1 / DEPTH_POWER)
}

function signedField(point: Point3) {
  return (
    surfaceFraction(point.x, point.y) ** CROSS_SECTION_POWER +
    Math.abs(point.z / depthAt(point.x, point.y)) ** DEPTH_POWER -
    1
  )
}

/** Outward normal for a rest-surface point, including the scalloped crown. */
export function surfaceNormal(point: Point3): Point3 {
  const h = 0.0005
  const dx =
    signedField({ x: point.x + h, y: point.y, z: point.z }) -
    signedField({ x: point.x - h, y: point.y, z: point.z })
  const dy =
    signedField({ x: point.x, y: point.y + h, z: point.z }) -
    signedField({ x: point.x, y: point.y - h, z: point.z })
  const dz =
    signedField({ x: point.x, y: point.y, z: point.z + h }) -
    signedField({ x: point.x, y: point.y, z: point.z - h })
  const length = Math.hypot(dx, dy, dz) || 1
  return { x: dx / length, y: dy / length, z: dz / length }
}

// The bubble stream only needs a safe, centered cross-section. Cache this
// conservative width instead of solving two outline intersections each frame.
const WIDTH_SAMPLES = 512
const widths = Float32Array.from({ length: WIDTH_SAMPLES + 1 }, (_, i) => {
  const y = (i / WIDTH_SAMPLES) * BODY_TOP
  if (surfaceFraction(0, y) >= 1) return 0
  const edge = (direction: -1 | 1) => {
    let inside = 0
    let outside = BODY_WIDTH * 1.2
    for (let j = 0; j < 18; j++) {
      const middle = (inside + outside) / 2
      if (surfaceFraction(direction * middle, y) < 1) inside = middle
      else outside = middle
    }
    return inside
  }
  return (Math.min(edge(-1), edge(1)) / BODY_WIDTH) * 0.9
})

/** Safe normalized half-width around x=0 for interior bubble placement. */
export function radiusAt(y: number) {
  const position = (Math.max(0, Math.min(BODY_TOP, y)) / BODY_TOP) * WIDTH_SAMPLES
  const index = Math.floor(position)
  if (index >= WIDTH_SAMPLES) return widths[WIDTH_SAMPLES]
  const fraction = position - index
  return widths[index] * (1 - fraction) + widths[index + 1] * fraction
}

/** Fixed seed: no layout jumps after StrictMode mount, theme changes or screenshot capture. */
export function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}
