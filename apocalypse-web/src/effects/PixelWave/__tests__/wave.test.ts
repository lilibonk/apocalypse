/**
 * PixelWave 双场纯函数契约（v2.11，docs/pixel-wave-spec.md §23）：
 * cellHash 确定性与值域、squareCoord 方形环坐标（切比雪夫距离）、equalDivision
 * 等分切割、fireBase/fireWaveIndex/cellLit 点火时序（从左下角开始、方形环
 * 传导、停留后恢复）、场计算推进方向与密度有界、typeHue 确定性与包裹、
 * 步进取整、道量化、道色明暗分档、缓冲复用一致性。
 */

import { describe, expect, it } from 'vitest'

import {
  cellHash,
  cellLit,
  computeLetterpressField,
  computeTypeField,
  createLetterpressCache,
  createTypeCache,
  deriveGridCount,
  equalDivision,
  fireBase,
  fireWaveIndex,
  hueLaneIndex,
  inDiagonalCorridor,
  letterpressCorner,
  letterpressDistance,
  letterpressDivision,
  letterpressHue,
  letterpressLift,
  letterpressWaveIndexAt,
  letterpressWaveLocalTime,
  oklchLaneColors,
  squareCoord,
  stepTime,
  typeHue,
  valueNoise,
  waveIndexAt,
  waveLocalTime,
  waveSeed,
  CORRIDOR_HALF,
  FILL_COLS,
  FIRE_JITTER_SECONDS,
  HUE_LANES,
  HUE_OSC_DEG,
  HUE_SEED_SPAN,
  LETTERPRESS_ACTIVE_SECONDS,
  LETTERPRESS_ATTACK_SECONDS,
  LETTERPRESS_CUTOFF,
  LETTERPRESS_GAP,
  LETTERPRESS_INITIAL_DELAY_SECONDS,
  LETTERPRESS_INTERVAL_SECONDS,
  LETTERPRESS_PITCH,
  LETTERPRESS_TAIL_SECONDS,
  LETTERPRESS_TRAVEL_SECONDS,
  PARTICIPATION,
  STEP_FPS,
  WAVE_DWELL_SECONDS,
  WAVE_INTERVAL_SECONDS,
  WAVE_ROUGHNESS_U,
  WAVE_TRAVEL_SECONDS,
} from '..'
import type { TypeFieldParams } from '..'

const GRID_W = 24
const GRID_H = 18

function params(time: number, overrides: Partial<TypeFieldParams> = {}): TypeFieldParams {
  return { time, baseHue: 280, ...overrides }
}

describe('cellHash（伪随机种子，确定性）', () => {
  it('同参同果', () => {
    expect(cellHash(3, 7, 0)).toBe(cellHash(3, 7, 0))
  })

  it('值域 [0,1)', () => {
    for (let x = -5; x < 40; x++) {
      for (let y = -5; y < 30; y++) {
        for (let salt = 0; salt < 6; salt++) {
          const h = cellHash(x, y, salt)
          expect(h).toBeGreaterThanOrEqual(0)
          expect(h).toBeLessThan(1)
        }
      }
    }
  })

  it('随坐标与 salt 变化（非常数、通道去相关）', () => {
    expect(cellHash(3, 7, 0)).not.toBe(cellHash(4, 7, 0))
    expect(cellHash(3, 7, 0)).not.toBe(cellHash(3, 8, 0))
    expect(cellHash(3, 7, 0)).not.toBe(cellHash(3, 7, 1))
    expect(cellHash(3, 7, 0, 11)).not.toBe(cellHash(3, 7, 0, 12))
  })
})

describe('每波独立噪声图', () => {
  it('波序号与本地时间按发射间隔切换', () => {
    expect(waveIndexAt(0)).toBe(0)
    expect(waveIndexAt(WAVE_INTERVAL_SECONDS - 0.01)).toBe(0)
    expect(waveIndexAt(WAVE_INTERVAL_SECONDS)).toBe(1)
    expect(waveLocalTime(WAVE_INTERVAL_SECONDS + 0.37)).toBeCloseTo(0.37, 10)
  })

  it('同 session + 波序号可复现，不同波与不同 session 均换 seed', () => {
    expect(waveSeed(1234, 5)).toBe(waveSeed(1234, 5))
    expect(waveSeed(1234, 5)).not.toBe(waveSeed(1234, 6))
    expect(waveSeed(1234, 5)).not.toBe(waveSeed(9876, 5))
  })

  it('同 seed 噪声图一致，不同 seed 会改变轮廓、参与、色相与浮雕高度纹理', () => {
    const a = createTypeCache(64, 48, 101)
    const replay = createTypeCache(64, 48, 101)
    const b = createTypeCache(64, 48, 202)
    expect([...a.u]).toEqual([...replay.u])
    expect([...a.takePart]).toEqual([...replay.takePart])
    expect([...a.terrain]).toEqual([...replay.terrain])
    expect([...a.u]).not.toEqual([...b.u])
    expect([...a.takePart]).not.toEqual([...b.takePart])
    expect([...a.hueSeed]).not.toEqual([...b.hueSeed])
    expect([...a.terrain]).not.toEqual([...b.terrain])
    expect([...a.terrain].every((height) => height >= 0.75 && height <= 1.35)).toBe(true)
  })

  it('平滑噪声值域与不规则度幅度有界', () => {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const noise = valueNoise(x / 3.5, y / 3.5, 42)
        expect(noise).toBeGreaterThanOrEqual(-1)
        expect(noise).toBeLessThanOrEqual(1)
      }
    }
    expect(WAVE_ROUGHNESS_U).toBeGreaterThan(0)
    expect(WAVE_ROUGHNESS_U).toBeLessThan(0.15)
  })

  it('相同传播相位下相邻两波不会重播同一组点亮格', () => {
    const sessionSeed = 0x5a17
    const phase = 1.6
    const first = computeTypeField(GRID_W, GRID_H, params(phase, { sessionSeed }))
    const second = computeTypeField(
      GRID_W,
      GRID_H,
      params(WAVE_INTERVAL_SECONDS + phase, { sessionSeed }),
    )
    expect([...first]).not.toEqual([...second])
  })
})

describe('squareCoord（方形环坐标，切比雪夫距离）', () => {
  it('左下角原点 = 0、最远角 = 1，退化网格归 0', () => {
    expect(squareCoord(0, GRID_H - 1, GRID_W, GRID_H)).toBe(0) // 左下
    expect(squareCoord(GRID_W - 1, 0, GRID_W, GRID_H)).toBe(1) // 右上（最远角）
    expect(squareCoord(0, 0, 1, 1)).toBe(0)
  })

  it('同环共享 u：max(x, oy) 相同的格子在同一方形环上（L 形波前）', () => {
    const max = Math.max(GRID_W - 1, GRID_H - 1)
    // 第 5 环：列 x=5（oy≤5）与 行 oy=5（x≤5）同 u
    expect(squareCoord(5, GRID_H - 1, GRID_W, GRID_H)).toBeCloseTo(5 / max, 10)
    expect(squareCoord(5, GRID_H - 1 - 3, GRID_W, GRID_H)).toBeCloseTo(5 / max, 10) // x=5, oy=3
    expect(squareCoord(2, GRID_H - 1 - 5, GRID_W, GRID_H)).toBeCloseTo(5 / max, 10) // x=2, oy=5
  })

  it('沿方形放大方向单调：max(x, oy) 越大 u 越大', () => {
    const max = Math.max(GRID_W - 1, GRID_H - 1)
    expect(squareCoord(10, GRID_H - 1, GRID_W, GRID_H)).toBeCloseTo(10 / max, 10)
    expect(squareCoord(0, GRID_H - 1 - 12, GRID_W, GRID_H)).toBeCloseTo(12 / max, 10)
  })
})

describe('equalDivision（等分切割方形大铅字块）', () => {
  it('1920×1080：宽 48 等分得 40px 块（4 倍数）、gap=5、行数铺满', () => {
    const div = equalDivision(1920, 1080)
    expect(div.gridW).toBe(FILL_COLS)
    expect(div.block).toBe(40)
    expect(div.block % 4).toBe(0)
    expect(div.gap).toBe(Math.min(12, Math.max(2, Math.round(40 / 8))))
    const pitch = div.block + div.gap
    expect(div.gridH).toBe(Math.ceil(1080 / pitch))
  })

  it('块边长恒为 4 的倍数且 ≥4，gap 夹 [2,12]', () => {
    for (const w of [390, 800, 1366, 1600, 2560]) {
      const div = equalDivision(w, 900)
      expect(div.block % 4).toBe(0)
      expect(div.block).toBeGreaterThanOrEqual(4)
      expect(div.gap).toBeGreaterThanOrEqual(2)
      expect(div.gap).toBeLessThanOrEqual(12)
      expect(div.gridH).toBeGreaterThanOrEqual(1)
    }
  })

  it('极窄容器兜底：块 min 4、行列 min 1', () => {
    const div = equalDivision(10, 10)
    expect(div.block).toBe(4)
    expect(div.gridW).toBe(FILL_COLS)
    expect(div.gridH).toBeGreaterThanOrEqual(1)
  })
})

describe('登录 letterpress 连续浪潮（图 3 忠实度）', () => {
  it('固定 32px 节距：28px 顶面 + 4px 缝隙，按完整网格铺满', () => {
    const div = letterpressDivision(1025, 851)
    expect(div.block).toBe(LETTERPRESS_PITCH - LETTERPRESS_GAP)
    expect(div.gap).toBe(LETTERPRESS_GAP)
    expect(div.gridW).toBe(Math.ceil(1025 / LETTERPRESS_PITCH))
    expect(div.gridH).toBe(Math.ceil(851 / LETTERPRESS_PITCH))
  })

  it('首波延时后计时，相邻波角点绝不重复', () => {
    expect(letterpressWaveIndexAt(LETTERPRESS_INITIAL_DELAY_SECONDS - 0.01)).toBe(-1)
    expect(letterpressWaveIndexAt(LETTERPRESS_INITIAL_DELAY_SECONDS)).toBe(0)
    expect(
      letterpressWaveIndexAt(LETTERPRESS_INITIAL_DELAY_SECONDS + LETTERPRESS_INTERVAL_SECONDS),
    ).toBe(1)
    expect(
      letterpressWaveLocalTime(
        LETTERPRESS_INITIAL_DELAY_SECONDS + LETTERPRESS_INTERVAL_SECONDS + 0.37,
      ),
    ).toBeCloseTo(0.37, 10)
    for (let index = 1; index < 40; index++) {
      expect(letterpressCorner(0x5a17, index)).not.toBe(letterpressCorner(0x5a17, index - 1))
    }
  })

  it('欧氏距离从角点向对角单调推进', () => {
    const near = letterpressDistance(0, 0, 32, 27, 0)
    const middle = letterpressDistance(16, 13, 32, 27, 0)
    const far = letterpressDistance(31, 26, 32, 27, 0)
    expect(near).toBeLessThan(middle)
    expect(middle).toBeLessThan(far)
    expect(far).toBeLessThanOrEqual(1)
  })

  it('剪影流光沿波前形成连续空间色带，并保持 0..360 包裹', () => {
    const a = letterpressHue(4, 4, 32, 27, 0, 0.5, 1.2, 280)
    const b = letterpressHue(12, 4, 32, 27, 0, 0.5, 1.2, 280)
    expect(a).not.toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(360)
    expect(letterpressHue(4, 4, 32, 27, 0, 0.5, 1.2, 280)).toBe(a)
  })

  it('同波缓存可复现，换 seed 后轮廓与高度纹理同时换新', () => {
    const a = createLetterpressCache(32, 27, 101, 0)
    const replay = createLetterpressCache(32, 27, 101, 0)
    const b = createLetterpressCache(32, 27, 202, 0)
    expect([...a.distance]).toEqual([...replay.distance])
    expect([...a.terrain]).toEqual([...replay.terrain])
    expect([...a.distance]).not.toEqual([...b.distance])
    expect([...a.terrain]).not.toEqual([...b.terrain])
  })

  it('连续帧热路径预计算到达时刻与空间色相，避免逐帧重复乘加和 atan2', () => {
    const cache = createLetterpressCache(32, 27, 101, 0)
    const x = 7
    const y = 9
    const i = y * 32 + x
    expect(cache.arrival[i]).toBeCloseTo(
      cache.distance[i] * LETTERPRESS_TRAVEL_SECONDS + cache.jitter[i],
      5,
    )
    expect(cache.huePhase[i]).toBeCloseTo(
      letterpressHue(x, y, 32, 27, 0, cache.hueSeed[i], 0, 0),
      5,
    )
    expect(LETTERPRESS_ACTIVE_SECONDS).toBeCloseTo(
      -LETTERPRESS_TAIL_SECONDS * Math.log(LETTERPRESS_CUTOFF),
      10,
    )
  })

  it('相隔 1/60s 的连续帧具有不同高度，不再量化到 100ms 台阶', () => {
    const sessionSeed = 0x5a17
    const time = LETTERPRESS_INITIAL_DELAY_SECONDS + 1.6
    const index = letterpressWaveIndexAt(time)
    const corner = letterpressCorner(sessionSeed, index)
    const cache = createLetterpressCache(32, 27, waveSeed(sessionSeed, index), corner)
    const fieldA = new Uint8Array(32 * 27)
    const fieldB = new Uint8Array(32 * 27)
    const liftsA = new Float32Array(32 * 27)
    const liftsB = new Float32Array(32 * 27)
    computeLetterpressField(32, 27, params(time, { sessionSeed }), cache, fieldA, undefined, liftsA)
    computeLetterpressField(
      32,
      27,
      params(time + 1 / 60, { sessionSeed }),
      cache,
      fieldB,
      undefined,
      liftsB,
    )
    const commonActive = [...fieldA].reduce(
      (count, value, i) => count + (value === 1 && fieldB[i] === 1 ? 1 : 0),
      0,
    )
    const changedHeights = [...liftsA].reduce(
      (count, value, i) => count + (Math.abs(value - liftsB[i]) > 0.0001 ? 1 : 0),
      0,
    )
    expect(commonActive).toBeGreaterThan(100)
    expect(changedHeights).toBeGreaterThan(100)
  })

  it('波包中段形成高密度连续高度场，不再是 35% 稀疏空框', () => {
    const sessionSeed = 0x5a17
    const time = LETTERPRESS_INITIAL_DELAY_SECONDS + 1.8
    const index = letterpressWaveIndexAt(time)
    const corner = letterpressCorner(sessionSeed, index)
    const cache = createLetterpressCache(32, 27, waveSeed(sessionSeed, index), corner)
    const lifts = new Float32Array(32 * 27)
    const field = computeLetterpressField(
      32,
      27,
      params(time, { sessionSeed }),
      cache,
      undefined,
      undefined,
      lifts,
    )
    const density = field.reduce((sum, value) => sum + value, 0) / field.length
    expect(density).toBeGreaterThan(0.2)
    expect(density).toBeLessThan(0.8)
    expect(lifts.filter((value) => value > 0).length).toBe(field.reduce((a, b) => a + b, 0))
    expect(
      new Set([...lifts].filter((value) => value > 0).map((value) => value.toFixed(3))).size,
    ).toBeGreaterThan(20)
  })

  it('首波前零渲染；相同传播相位的下一波场形状不同', () => {
    const sessionSeed = 0x91a7
    const before = computeLetterpressField(
      32,
      27,
      params(LETTERPRESS_INITIAL_DELAY_SECONDS - 0.01, { sessionSeed }),
    )
    expect(before.every((value) => value === 0)).toBe(true)

    const phase = 1.8
    const first = computeLetterpressField(
      32,
      27,
      params(LETTERPRESS_INITIAL_DELAY_SECONDS + phase, { sessionSeed }),
    )
    const second = computeLetterpressField(
      32,
      27,
      params(LETTERPRESS_INITIAL_DELAY_SECONDS + LETTERPRESS_INTERVAL_SECONDS + phase, {
        sessionSeed,
      }),
    )
    expect([...first]).not.toEqual([...second])
  })
})

describe('inDiagonalCorridor（对角走廊，约束涟漪不漫入表单区）', () => {
  it('对角线上的格子在走廊内，远离对角的格子在走廊外', () => {
    const W = 120
    const H = 90
    // 对角中点：nx ≈ noy → 走廊内
    expect(inDiagonalCorridor(59, H - 1 - 44, W, H)).toBe(true)
    // 左上角（nx 小、noy 大）与右下角（nx 大、noy 小）：走廊外
    expect(inDiagonalCorridor(0, 0, W, H)).toBe(false)
    expect(inDiagonalCorridor(W - 1, H - 1, W, H)).toBe(false)
  })

  it('半宽边界：|nx − noy| ≤ CORRIDOR_HALF 内入廊，恰好越界出廊', () => {
    const W = 101
    const H = 101
    // 选 x 使 nx 与 noy 差恰好在边界两侧（原点格在左下角）
    const y = H - 1 // noy = 0
    expect(inDiagonalCorridor(Math.floor(CORRIDOR_HALF * (W - 1)), y, W, H)).toBe(true)
    expect(inDiagonalCorridor(Math.ceil(CORRIDOR_HALF * (W - 1)) + 2, y, W, H)).toBe(false)
  })

  it('场计算：走廊外的格子任何时刻都不点亮', () => {
    const cache = createTypeCache(120, 90)
    for (let t = 0; t < 30; t += 0.83) {
      const field = computeTypeField(120, 90, params(t), cache)
      for (let i = 0; i < field.length; i++) {
        if (cache.corridor[i] === 0) {
          expect(field[i]).toBe(0)
        }
      }
    }
  })
})

describe('PARTICIPATION（不是每个方块：波带内固定参与率）', () => {
  it('参与掩码确定性，大网格参与比例 ≈ PARTICIPATION', () => {
    const cache = createTypeCache(160, 120)
    let part = 0
    for (const v of cache.takePart) part += v
    const ratio = part / cache.takePart.length
    expect(ratio).toBeGreaterThan(PARTICIPATION - 0.06)
    expect(ratio).toBeLessThan(PARTICIPATION + 0.06)
  })

  it('场计算：同一波内不参与（takePart=0）的格子不会点亮', () => {
    const cache = createTypeCache(120, 90)
    for (let t = 0; t < WAVE_INTERVAL_SECONDS; t += 0.37) {
      const field = computeTypeField(120, 90, params(t), cache)
      for (let i = 0; i < field.length; i++) {
        if (cache.takePart[i] === 0) {
          expect(field[i]).toBe(0)
        }
      }
    }
  })
})

describe('fireBase（点火基底时刻）', () => {
  it('= 方形环坐标 × 传导时长 + 抖动', () => {
    expect(fireBase(0, 0)).toBe(0)
    expect(fireBase(1, 0)).toBe(WAVE_TRAVEL_SECONDS)
    expect(fireBase(0.5, 0.1)).toBeCloseTo(0.5 * WAVE_TRAVEL_SECONDS + 0.1, 10)
  })
})

describe('fireWaveIndex（命中环序号）', () => {
  it('首环未到达为负，到达后从 0 起按间隔递进', () => {
    const base = 1
    expect(fireWaveIndex(0.5, base)).toBeLessThan(0) // 未到达
    expect(fireWaveIndex(1, base)).toBe(0) // 恰好到达
    expect(fireWaveIndex(base + WAVE_INTERVAL_SECONDS - 0.01, base)).toBe(0)
    expect(fireWaveIndex(base + WAVE_INTERVAL_SECONDS, base)).toBe(1)
    expect(fireWaveIndex(base + 2.7 * WAVE_INTERVAL_SECONDS, base)).toBe(2)
  })
})

describe('cellLit（铅字起落：到达点亮、停留恢复、周期再点火）', () => {
  const base = 1.2

  it('确定性：同参同果', () => {
    expect(cellLit(base, 3.3)).toBe(cellLit(base, 3.3))
  })

  it('首环未到达恒 OFF（从左下角开始，远端等待波前）', () => {
    for (let t = 0; t < base; t += 0.05) {
      expect(cellLit(base, t)).toBe(false)
    }
  })

  it('到达后 dwell 窗内 ON、过窗 OFF（路过恢复）', () => {
    expect(cellLit(base, base)).toBe(true) // 到达瞬间点亮
    expect(cellLit(base, base + WAVE_DWELL_SECONDS - 0.01)).toBe(true) // 停留窗内
    expect(cellLit(base, base + WAVE_DWELL_SECONDS)).toBe(false) // 停留结束恢复
    expect(cellLit(base, base + 2)).toBe(false)
  })

  it('按发射间隔周期再点火', () => {
    const second = base + WAVE_INTERVAL_SECONDS
    expect(cellLit(base, second)).toBe(true)
    expect(cellLit(base, second + WAVE_DWELL_SECONDS - 0.01)).toBe(true)
    expect(cellLit(base, second + WAVE_DWELL_SECONDS)).toBe(false)
  })
})

describe('letterpressLift（登录连续浪潮指数包络）', () => {
  it('未到达为 0，快速抬升至峰值后以指数长尾回落', () => {
    expect(LETTERPRESS_TAIL_SECONDS).toBe(0.38)
    expect(letterpressLift(-0.01)).toBe(0)
    expect(letterpressLift(0)).toBe(0)
    const rising = letterpressLift(LETTERPRESS_ATTACK_SECONDS / 2)
    const peak = letterpressLift(0.15)
    const tail = letterpressLift(0.6)
    expect(rising).toBeGreaterThan(0)
    expect(peak).toBeGreaterThan(rising)
    expect(tail).toBeLessThan(peak)
    expect(letterpressLift(2)).toBeLessThan(LETTERPRESS_CUTOFF)
  })

  it('长程值域保持 [0,1]', () => {
    for (let elapsed = -0.1; elapsed <= 4; elapsed += 0.01) {
      const lift = letterpressLift(elapsed)
      expect(lift).toBeGreaterThanOrEqual(0)
      expect(lift).toBeLessThanOrEqual(1)
    }
  })
})

describe('typeHue（五彩，确定性）', () => {
  it('同参同果', () => {
    expect(typeHue(0.3, 1.5, 280)).toBe(typeHue(0.3, 1.5, 280))
  })

  it('值域包裹到 [0,360)', () => {
    const cases: ReadonlyArray<readonly [number, number, number]> = [
      [0, 0, 280],
      [0.999, 0, 280],
      [0.5, 100, 280],
      [0.5, -100, 350],
      [0.5, 0, -40],
    ]
    for (const args of cases) {
      const hue = typeHue(...args)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })

  it('块块异色：hue 随 hueSeed 沿色带展开', () => {
    const a = typeHue(0, 0, 280)
    const b = typeHue(0.5, 0, 280) // +60°（HUE_SEED_SPAN 120 的一半）
    expect(b).toBeCloseTo((a + HUE_SEED_SPAN / 2) % 360, 5)
  })

  it('时间慢漂有界（±HUE_OSC_DEG 正弦，非单调流）', () => {
    for (let t = 0; t < 60; t += 0.5) {
      const drift = typeHue(0.25, t, 0) - 0.25 * HUE_SEED_SPAN
      expect(Math.abs(drift)).toBeLessThanOrEqual(HUE_OSC_DEG + 1e-9)
    }
  })
})

describe('hueLaneIndex（道量化）', () => {
  it('值域 [0, HUE_LANES) 且边界正确', () => {
    expect(hueLaneIndex(0)).toBe(0)
    expect(hueLaneIndex(359.999)).toBe(HUE_LANES - 1)
    expect(hueLaneIndex(360)).toBe(0)
    expect(hueLaneIndex(-15)).toBe(HUE_LANES - 1)
    for (let h = -720; h <= 720; h += 7.3) {
      const lane = hueLaneIndex(h)
      expect(lane).toBeGreaterThanOrEqual(0)
      expect(lane).toBeLessThan(HUE_LANES)
    }
  })
})

describe('oklchLaneColors（程序化 oklch，明暗两档）', () => {
  it('道数 = HUE_LANES，均为 oklch 字符串，同参同果', () => {
    const light = oklchLaneColors(false)
    expect(light).toHaveLength(HUE_LANES)
    expect(light.every((c) => c.startsWith('oklch('))).toBe(true)
    expect(oklchLaneColors(true)).toEqual(oklchLaneColors(true))
  })

  it('暗色档降低明度防刺眼（与亮色档不同）', () => {
    const light = oklchLaneColors(false)
    const dark = oklchLaneColors(true)
    expect(dark).not.toEqual(light)
    expect(dark[0]).toContain('0.6')
    expect(light[0]).toContain('0.72')
  })
})

describe('stepTime（10fps 步进取整）', () => {
  it('按 STEP_FPS 栅格向下取整', () => {
    expect(stepTime(0)).toBe(0)
    expect(stepTime(0.099)).toBe(0)
    expect(stepTime(0.1)).toBe(0.1)
    expect(stepTime(1.23456)).toBe(1.2)
    expect(STEP_FPS).toBe(10)
  })
})

describe('computeTypeField（方形涟漪场）', () => {
  it('场值只有 0/1（实心整块，无中间亮度）', () => {
    const field = computeTypeField(GRID_W, GRID_H, params(3.7))
    for (const v of field) {
      expect(v === 0 || v === 1).toBe(true)
    }
  })

  it('确定性：固定时间两次计算逐格一致', () => {
    const a = computeTypeField(GRID_W, GRID_H, params(2.1))
    const b = computeTypeField(GRID_W, GRID_H, params(2.1))
    expect([...a]).toEqual([...b])
  })

  it('从左下角开始：首环传导中途，波前未到区域（u 大）零点亮', () => {
    const cache = createTypeCache(120, 90)
    const time = WAVE_TRAVEL_SECONDS / 2 // 首环走到一半
    const field = computeTypeField(120, 90, params(time), cache)
    const uLimit = 0.5 + FIRE_JITTER_SECONDS / WAVE_TRAVEL_SECONDS + 1e-6
    for (let i = 0; i < field.length; i++) {
      if (cache.u[i] > uLimit) {
        expect(field[i]).toBe(0) // 波前未到：远端仍是纯背景
      }
    }
  })

  it('方形环扩散：点亮重心（u 均值）随时间向远角推进', () => {
    const cache = createTypeCache(120, 90)
    const centroid = (time: number) => {
      const field = computeTypeField(120, 90, params(time), cache)
      let lit = 0
      let sum = 0
      for (let i = 0; i < field.length; i++) {
        lit += field[i]
        sum += field[i] * cache.u[i]
      }
      return lit > 0 ? sum / lit : -1
    }
    const early = centroid(1)
    const late = centroid(2.5)
    expect(early).toBeGreaterThanOrEqual(0)
    expect(late).toBeGreaterThan(early) // 点亮重心沿方形环向远角推进
  })

  it('点亮密度有界（走廊内稀疏，环间允许全暗恢复期）', () => {
    const cache = createTypeCache(120, 90)
    let maxDensity = 0
    for (let t = 6; t < 60; t += 0.37) {
      const field = computeTypeField(120, 90, params(t), cache)
      let lit = 0
      for (const v of field) lit += v
      const density = lit / field.length
      expect(density).toBeLessThan(0.3) // 任何时刻不过密
      if (density > maxDensity) maxDensity = density
    }
    expect(maxDensity).toBeGreaterThan(0.003) // 环在途时有可读密度（走廊 × 参与率下均值更低）
    // 环间恢复：存在全暗时刻（路过恢复、基态干净）
    const dark = computeTypeField(120, 90, params(13.32), cache)
    expect(dark.every((v) => v === 0)).toBe(true)
  })

  it('ON 格的 hue 道 = typeHue 量化，OFF 格不写道', () => {
    const cache = createTypeCache(GRID_W, GRID_H)
    const lanes = new Uint8Array(GRID_W * GRID_H).fill(255)
    const field = computeTypeField(GRID_W, GRID_H, params(0.5), cache, undefined, lanes)
    for (let i = 0; i < field.length; i++) {
      if (field[i] === 1) {
        expect(lanes[i]).toBe(hueLaneIndex(typeHue(cache.hueSeed[i], 0.5, 280)))
      } else {
        expect(lanes[i]).toBe(255) // 未被触碰
      }
    }
  })

  it('缓存路径与无缓存路径逐格一致，out/lanes 复用同一引用', () => {
    const cache = createTypeCache(GRID_W, GRID_H)
    const withCache = computeTypeField(GRID_W, GRID_H, params(1.3), cache)
    const withoutCache = computeTypeField(GRID_W, GRID_H, params(1.3))
    expect([...withCache]).toEqual([...withoutCache])

    const out = new Uint8Array(GRID_W * GRID_H)
    const lanes = new Uint8Array(GRID_W * GRID_H)
    const field = computeTypeField(GRID_W, GRID_H, params(0.6), undefined, out, lanes)
    expect(field).toBe(out)
    expect([...field]).toEqual([...computeTypeField(GRID_W, GRID_H, params(0.6))])
  })

  it('可选浮雕缓冲仅为 ON 格写入高度，且复用时先清零', () => {
    const cache = createTypeCache(GRID_W, GRID_H)
    const lifts = new Float32Array(GRID_W * GRID_H).fill(99)
    const field = computeTypeField(GRID_W, GRID_H, params(0.5), cache, undefined, undefined, lifts)
    let raised = 0
    for (let i = 0; i < field.length; i++) {
      if (field[i] === 1 && lifts[i] > 0) raised++
      if (field[i] === 0) expect(lifts[i]).toBe(0)
      expect(lifts[i]).toBeLessThanOrEqual(1.35)
    }
    expect(raised).toBeGreaterThan(0)
  })
})

describe('deriveGridCount 填充推导（v2.1 保留，显式 cols/rows 模式）', () => {
  it('显式 cols/rows：原样取整（旧行为，PageLoading 条带不受影响）', () => {
    expect(deriveGridCount(256, 8, 32)).toBe(32)
    expect(deriveGridCount(999, 8, 32)).toBe(32)
    expect(deriveGridCount(10, 8, 32)).toBe(32)
  })

  it('缺省推导：ceil 铺满容器（超出部分由画布对称裁切）', () => {
    expect(deriveGridCount(256, 8)).toBe(32)
    expect(deriveGridCount(257, 8)).toBe(33)
    expect(deriveGridCount(1920, 8)).toBe(240)
    expect(deriveGridCount(1080, 8)).toBe(135)
  })

  it('兜底：非法输入最小 1 格', () => {
    expect(deriveGridCount(0, 8)).toBe(1)
    expect(deriveGridCount(1, 8)).toBe(1)
    expect(deriveGridCount(100, 8, 0)).toBe(1)
    expect(deriveGridCount(100, 8, -5)).toBe(1)
  })
})
