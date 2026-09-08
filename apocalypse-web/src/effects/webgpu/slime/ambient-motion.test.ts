import { describe, expect, it } from 'vitest'

import {
  advanceGaze,
  bubblePoint,
  bubbleVisibility,
  gazeTarget,
  GAZE,
  BUBBLE_MOTION,
} from './ambient-motion'
import { eyePoint } from './expression'
import { frontSurfaceZ, seededRandom } from './shape'

describe('人工验收回归：视线跟随', () => {
  it('鼠标目标限幅，视线平滑靠近而不跳跃', () => {
    expect(gazeTarget(50, -50)).toEqual({ x: 1, y: -1 })
    expect(gazeTarget(NaN, Infinity)).toEqual({ x: 0, y: 0 })
    const gaze = { x: 0, y: 0 }
    advanceGaze(gaze, { x: 1, y: -1 }, 1 / 60)
    expect(gaze.x).toBeGreaterThan(0)
    expect(gaze.x).toBeLessThan(0.2)
    for (let i = 0; i < 120; i++) advanceGaze(gaze, { x: 1, y: -1 }, 1 / 60)
    expect(gaze.x).toBeCloseTo(1, 4)
    expect(gaze.y).toBeCloseTo(-1, 4)
  })
  it('两眼实际移动但仍贴皮，闭眼不跟随鼠标', () => {
    for (const side of [-1, 1]) {
      const rest = { x: side * 0.42, y: 0.98, z: frontSurfaceZ(side * 0.42, 0.98) + 0.03 }
      const moved = eyePoint(rest, 'idle', 0, { x: 1, y: 1 })
      expect(moved.x - rest.x).toBeCloseTo(GAZE.maxX)
      expect(moved.y - rest.y).toBeCloseTo(GAZE.maxY)
      expect(moved.z - frontSurfaceZ(moved.x, moved.y)).toBeCloseTo(0.03)
      expect(eyePoint(rest, 'sleeping', 0, { x: 1, y: 1 })).toEqual(eyePoint(rest, 'sleeping', 0))
    }
  })
})

describe('人工验收回归：体内气泡漂浮', () => {
  it('缓慢单向上浮而非正弦往返，不同气泡速度不同', () => {
    const rest = { x: 0.7, y: 0.6, z: frontSurfaceZ(0.7, 0.6) * 0.9 }
    const a = bubblePoint(rest, 0.02, 0, 0, { x: 0, y: 0, z: 0 })
    const b = bubblePoint(rest, 0.02, 0, 2, { x: 0, y: 0, z: 0 })
    const c = bubblePoint(rest, 0.02, 1, 2, { x: 0, y: 0, z: 0 })
    expect(b.y - a.y).toBeCloseTo(0.038)
    expect(c.y).toBeGreaterThan(b.y)
    for (let second = 1; second <= 30; second++) {
      const previous = bubblePoint(rest, 0.02, 0, second - 1, { x: 0, y: 0, z: 0 })
      const next = bubblePoint(rest, 0.02, 0, second, { x: 0, y: 0, z: 0 })
      expect(next.y).toBeGreaterThan(previous.y)
      expect(Math.abs(next.x - previous.x)).toBeLessThan(0.012)
    }
    expect(bubblePoint(rest, 0.02, 0, 0, { x: 0, y: 0, z: 0 })).toEqual(a)
  })
  it('长时间漂浮始终留在实际椭球内，不穿出外皮', () => {
    const random = seededRandom(85)
    for (let index = 0; index < 32; index++) {
      const y = 0.22 + random() * 1.36
      const x = (random() - 0.5) * 1.82 * Math.sin((y / 2) * Math.PI) ** 0.5
      const radius = 0.006 + random() ** 2 * 0.027
      const rest = { x, y, z: frontSurfaceZ(x, y) * (-0.35 + random() * 1.08) }
      for (let second = 0; second < 600; second += 0.75) {
        const point = bubblePoint(rest, radius, index, second, { x: 0, y: 0, z: 0 })
        expect(point.y).toBeGreaterThan(radius)
        expect(Math.abs(point.z) + radius).toBeLessThan(frontSurfaceZ(point.x, point.y))
      }
    }
  })
  it('重生前后完全透明，不在可见区跳回底部', () => {
    expect(bubbleVisibility(BUBBLE_MOTION.bottom)).toBe(0)
    expect(bubbleVisibility(BUBBLE_MOTION.top)).toBe(0)
    expect(bubbleVisibility(0.8)).toBe(1)
    const rest = { x: 0.4, y: 0.6, z: 0.2 }
    let previous = bubblePoint(rest, 0.02, 0, 0, { x: 0, y: 0, z: 0 })
    let rebirths = 0
    for (let frame = 1; frame <= 120 * 60; frame++) {
      const next = bubblePoint(rest, 0.02, 0, frame / 60, { x: 0, y: 0, z: 0 })
      if (next.y < previous.y) {
        rebirths++
        expect(bubbleVisibility(previous.y)).toBe(0)
        expect(bubbleVisibility(next.y)).toBe(0)
      }
      previous = next
    }
    expect(rebirths).toBeGreaterThan(0)
  })
})
