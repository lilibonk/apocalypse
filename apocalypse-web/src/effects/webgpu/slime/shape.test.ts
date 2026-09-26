import { describe, expect, it } from 'vitest'
import {
  BODY_CENTER_Y,
  BODY_DEPTH,
  BODY_TOP,
  BODY_WIDTH,
  CROWN,
  FACE_LEFT,
  FACE_MOUTH,
  FACE_RIGHT,
  frontSurfaceZ,
  radiusAt,
  restPoint,
  surfaceNormal,
} from './shape'

const perimeter = () =>
  Array.from({ length: 2048 }, (_, i) => {
    const angle = (i / 2048) * Math.PI * 2
    return restPoint(Math.cos(angle), Math.sin(angle), 0)
  })

function upperAtX(points: ReturnType<typeof perimeter>, x: number) {
  return points
    .filter((point) => point.y > BODY_CENTER_Y)
    .reduce((closest, point) => (Math.abs(point.x - x) < Math.abs(closest.x - x) ? point : closest))
}

describe('milk-cloud authored surface', () => {
  it('uses one exact field for front and back skin, face anchors and crown', () => {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2
      for (const z of [-0.9, -0.55, -0.2, 0.2, 0.55, 0.9]) {
        const radial = Math.sqrt(1 - z * z)
        const skin = restPoint(Math.cos(angle) * radial, Math.sin(angle) * radial, z)
        const front = frontSurfaceZ(skin.x, skin.y)
        expect(Object.values(skin).every(Number.isFinite)).toBe(true)
        expect(Number.isFinite(front)).toBe(true)
        expect(front).toBeCloseTo(Math.abs(skin.z), 5)
      }
    }
    expect(frontSurfaceZ(0, BODY_CENTER_Y)).toBeGreaterThan(BODY_DEPTH * 0.9)
    for (const face of [FACE_LEFT, FACE_RIGHT, FACE_MOUTH])
      expect(frontSurfaceZ(face.x, face.y)).toBeGreaterThan(BODY_DEPTH * 0.6)
    expect(frontSurfaceZ(CROWN.x, CROWN.y)).toBeLessThan(0.03)
  })

  it('keeps finite unit normals across the crown, left tuck, front and back', () => {
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2
      for (const z of [-0.9, -0.5, 0, 0.5, 0.9]) {
        const radial = Math.sqrt(1 - z * z)
        const skin = restPoint(Math.cos(angle) * radial, Math.sin(angle) * radial, z)
        const normal = surfaceNormal(skin)
        expect(Object.values(normal).every(Number.isFinite)).toBe(true)
        expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 5)
        if (z !== 0) expect(normal.z * z).toBeGreaterThan(0)
      }
    }
  })

  it('traces a smooth silhouette with a shallow top valley and higher right shoulder', () => {
    const points = perimeter()
    const left = upperAtX(points, -BODY_WIDTH * 0.56)
    const valley = upperAtX(points, -BODY_WIDTH * 0.3)
    const center = upperAtX(points, 0)
    const right = upperAtX(points, CROWN.x)
    expect(left.y - valley.y).toBeGreaterThan(0.005)
    expect(left.y - valley.y).toBeLessThan(BODY_TOP * 0.06)
    expect(center.y).toBeGreaterThan(valley.y + 0.05)
    expect(right.y).toBeGreaterThan(center.y + 0.2)
    expect(right.y).toBeGreaterThan(BODY_TOP - 0.05)

    for (let i = 0; i < points.length; i++) {
      const previous = points[(i + points.length - 1) % points.length]
      const current = points[i]
      const next = points[(i + 1) % points.length]
      const ax = current.x - previous.x
      const ay = current.y - previous.y
      const bx = next.x - current.x
      const by = next.y - current.y
      const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by)
      expect(Math.hypot(bx, by)).toBeLessThan(BODY_WIDTH * 0.02)
      expect(Math.abs(turn)).toBeLessThan(0.15)
    }
  })

  it('keeps the front belly full and centered bubble widths inside the surface', () => {
    const frontBelly = restPoint(0.6, 0, 0.8)
    expect(frontBelly.z).toBeGreaterThan(BODY_DEPTH * 0.75)
    expect(frontSurfaceZ(frontBelly.x, frontBelly.y)).toBeCloseTo(frontBelly.z, 5)

    for (const y of [0.19, 0.5, BODY_CENTER_Y, 2.15]) {
      const width = BODY_WIDTH * radiusAt(y)
      expect(width).toBeGreaterThan(0.2)
      expect(width).toBeLessThan(BODY_WIDTH)
      for (const x of [-width, 0, width]) {
        const front = frontSurfaceZ(x, y)
        expect(front).toBeGreaterThan(0)
        expect(Math.abs(front * 0.5)).toBeLessThan(front)
      }
    }
    expect(frontSurfaceZ(BODY_WIDTH * 2, BODY_CENTER_Y)).toBe(0)
  })
})
