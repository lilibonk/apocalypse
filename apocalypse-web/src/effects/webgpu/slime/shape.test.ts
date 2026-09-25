import { expect, test } from 'vitest'
import { frontSurfaceZ, radiusAt, restPoint } from './shape'

test('the wide lower body and face anchors share one continuous skin', () => {
  expect(radiusAt(0.35)).toBeGreaterThan(radiusAt(2.45) * 1.4)

  for (const [x, y, z] of [
    [-0.5, -0.7, 0.51],
    [0.25, 0.1, 0.96],
    [0.6, 0.55, 0.58],
  ]) {
    const length = Math.hypot(x, y, z)
    const skin = restPoint(x / length, y / length, z / length)
    expect(skin.z).toBeCloseTo(frontSurfaceZ(skin.x, skin.y), 6)
  }
})
