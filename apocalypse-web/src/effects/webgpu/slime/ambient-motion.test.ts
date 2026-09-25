import { describe, expect, it } from 'vitest'
import { bubblePoint, type BubbleSeed } from './ambient-motion'
import { BODY_DEPTH, BODY_WIDTH, frontSurfaceZ, radiusAt, seededRandom } from './shape'
const point = () => ({ x: 0, y: 0, z: 0, scale: 0 })
const seed: BubbleSeed = { x: 0.3, y: 0.6, z: 0.6, size: 0.02, phase: 0.8 }
describe('作者气泡：上浮、端点缩放与体积约束', () => {
  it('单向上浮、尺寸影响速度、轻微横漂、固定时刻确定性', () => {
    const a = bubblePoint(seed, 0, point())
    const b = bubblePoint(seed, 2, point())
    expect(b.y - a.y).toBeCloseTo((0.026 + 0.02 * 0.65 + 0.8 * 0.002) * 2)
    expect(bubblePoint({ ...seed, size: 0.03 }, 2, point()).y).toBeGreaterThan(b.y)
    expect(bubblePoint(seed, 0, point())).toEqual(a)
    expect(Math.abs(b.x - a.x)).toBeLessThan(0.1)
  })
  it('长时间漂浮不穿皮，底部/顶端渐隐重生', () => {
    const random = seededRandom(71561)
    let wraps = 0
    let largestNormalizedRadius = 0
    let minimumClearance = Infinity
    let largestWrapScale = 0
    for (let i = 0; i < 32; i++) {
      const b = {
        ...seed,
        size: 0.009 + random() ** 2.8 * 0.033,
        x: random() * 0.8,
        phase: random() * Math.PI * 2,
      }
      let previous = bubblePoint(b, 0, point())
      for (let t = 1 / 60; t < 120; t += 1 / 60) {
        const p = bubblePoint(b, t, point())
        largestNormalizedRadius = Math.max(
          largestNormalizedRadius,
          Math.hypot(p.x / (BODY_WIDTH * radiusAt(p.y)), p.z / (BODY_DEPTH * radiusAt(p.y))),
        )
        minimumClearance = Math.min(
          minimumClearance,
          frontSurfaceZ(p.x, p.y) - Math.abs(p.z) - p.scale,
        )
        if (p.y < previous.y) {
          wraps++
          largestWrapScale = Math.max(largestWrapScale, p.scale / b.size, previous.scale / b.size)
        }
        previous = p
      }
    }
    expect(wraps).toBeGreaterThan(0)
    expect(largestNormalizedRadius).toBeLessThan(1)
    expect(minimumClearance).toBeGreaterThan(0)
    expect(largestWrapScale).toBeLessThan(0.015)
  })
})
