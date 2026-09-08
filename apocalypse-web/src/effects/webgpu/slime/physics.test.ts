import { describe, expect, it } from 'vitest'

import { eyePoint, mouthPoint } from './expression'
import { summarizeFrames } from './performance'
import {
  advancePhysics,
  beginPress,
  bulkScale,
  createPhysics,
  deformPoint,
  moveGrab,
  PHYSICS,
  releasePress,
} from './physics'
import { frontSurfaceZ } from './shape'

const settle = (state: ReturnType<typeof createPhysics>, seconds: number) => {
  for (let i = 0; i < seconds * 120; i++) advancePhysics(state, 1 / 120)
}

describe('软体物理边界', () => {
  it('局部压力凹陷明显大于远端；松手后阻尼回弹恢复', () => {
    const state = createPhysics()
    beginPress(state, { x: 0, y: 1, z: 1 })
    settle(state, 1)
    const near = deformPoint(0, 1, 1, state, { x: 0, y: 0, z: 0 })
    const far = deformPoint(1, 1, 0.5, state, { x: 0, y: 0, z: 0 })
    expect(1 - near.z).toBeGreaterThan(0.25)
    expect(Math.abs(0.5 - far.z)).toBeLessThan(0.04)
    releasePress(state)
    settle(state, 4)
    expect(Math.abs(state.dent)).toBeLessThan(0.0001)
    expect(Math.abs(state.stretch)).toBeLessThan(0.0001)
  })
  it('拎起有限位，松手受重力下落、碰桌后变形并归位', () => {
    const state = createPhysics()
    beginPress(state, { x: 0, y: 1, z: 1 })
    moveGrab(state, 999, 999)
    settle(state, 1)
    expect(state.y).toBeCloseTo(PHYSICS.maxLift, 2)
    expect(state.x).toBeLessThanOrEqual(PHYSICS.maxSide)
    releasePress(state)
    let compressed = false
    for (let i = 0; i < 600; i++) {
      advancePhysics(state, 1 / 120)
      expect(state.y).toBeGreaterThanOrEqual(0)
      if (state.impacts > 0 && state.stretch < -0.01) compressed = true
    }
    expect(compressed).toBe(true)
    expect(state.impacts).toBeGreaterThan(0)
    expect(state.y).toBe(0)
    expect(Math.abs(state.x)).toBeLessThan(0.001)
    expect(state.pressed).toBe(false)
    expect(state.dragged).toBe(false)
  })
  it('体积缩放行列式为 1；超长帧与无效输入不会使积分失控', () => {
    for (const stretch of [-0.26, 0, 0.15]) {
      const scale = bulkScale(stretch)
      expect(scale.x * scale.y * scale.z).toBeCloseTo(1, 12)
    }
    const state = createPhysics()
    for (const dt of [NaN, Infinity, -1, 10000]) advancePhysics(state, dt)
    expect(state.elapsed).toBeLessThanOrEqual(PHYSICS.maxDelta + PHYSICS.step)
    expect(Number.isFinite(state.y)).toBe(true)
  })
  it('相同固定步数在 60 / 120Hz 下得到相同结果', () => {
    const a = createPhysics()
    const b = createPhysics()
    beginPress(a, { x: 0, y: 1, z: 1 })
    beginPress(b, { x: 0, y: 1, z: 1 })
    for (let i = 0; i < 120; i++) advancePhysics(a, 1 / 60)
    for (let i = 0; i < 240; i++) advancePhysics(b, 1 / 120)
    expect(a).toEqual(b)
  })
})

describe('五官表面绑定', () => {
  it.each(['idle', 'waiting', 'success', 'error', 'sleeping'] as const)(
    '%s 的嘴与眼睛沿同一外皮而非浮动坐标',
    (expression) => {
      const state = createPhysics()
      beginPress(state, { x: 0, y: 0.9, z: 1 })
      settle(state, 1)
      for (let i = 0; i <= 20; i++) {
        const mouth = mouthPoint(i / 20, 0.25, expression)
        expect(mouth.z - frontSurfaceZ(mouth.x, mouth.y)).toBeCloseTo(0.035)
        const face = deformPoint(mouth.x, mouth.y, mouth.z, state, { x: 0, y: 0, z: 0 })
        const skin = deformPoint(mouth.x, mouth.y, frontSurfaceZ(mouth.x, mouth.y), state, {
          x: 0,
          y: 0,
          z: 0,
        })
        expect(Math.abs(face.z - skin.z)).toBeLessThan(0.055)
      }
      const eye = eyePoint({ x: 0.42, y: 1.02, z: frontSurfaceZ(0.42, 1.02) + 0.03 }, expression, 0)
      expect(eye.z - frontSurfaceZ(eye.x, eye.y)).toBeCloseTo(0.03)
      if (expression === 'sleeping') expect(eye.y).toBeLessThan(1)
    },
  )
})

describe('性能报告口径', () => {
  it('按有效提交帧间隔计算 FPS、p95 与慢帧，而不是瞬时最高值', () => {
    const result = summarizeFrames([
      ...Array.from({ length: 95 }, () => 10),
      ...Array.from({ length: 5 }, () => 30),
      NaN,
      0,
    ])
    expect(result).toEqual({
      frames: 100,
      elapsedMs: 1100,
      averageFps: 100000 / 1100,
      p95FrameMs: 10,
      framesOver25Ms: 5,
    })
    expect(summarizeFrames([]).averageFps).toBe(0)
  })
})
