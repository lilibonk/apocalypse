/**
 * PixelOrb 契约测试（node 环境，纯函数无需 canvas DOM）：
 * 皮肤注册表 / SDF 与法线 / 色阶量化边界 / 栅格确定性与 palette 键完整性 /
 * size 校验 / 各状态眼睛不越界 / gaze 视线 / 弹簧回归 / 眨眼帧数 / 组件渲染。
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  BLINK_FRAMES,
  DEFAULT_ORB_SKIN,
  GAZE_RANGE_RATIO,
  GAZE_SATURATION_PX,
  GAZE_TILT_MAX_DEG,
  ORB_CX,
  ORB_CY,
  ORB_GRID,
  ORB_LEGAL_SIZES,
  ORB_RADIUS,
  ORB_SKINS,
  PixelOrb,
  blinkLid,
  composeOrb,
  computeGaze,
  isValidOrbSize,
  orbTier,
  orbUnit,
  quantizeShade,
  rasterizeBody,
  rasterToRgba,
  resolvePalette,
  spherePixel,
  sphereShade,
  springStep,
} from '..'
import type { OrbPaletteKey, OrbState, OrbTier, SkinId } from '..'

const ALL_STATES: OrbState[] = ['idle', 'waiting', 'success', 'error', 'sleeping']
const ALL_TIERS: OrbTier[] = ['full', 'clear', 'simple', 'icon']
const ALL_SKINS: SkinId[] = ['v3', 'v4']
/** 栅格可能用到的全部 palette 语义键（色阶 5 键 + 信号视窗 2 键）。 */
const ALL_PALETTE_KEYS: OrbPaletteKey[] = [
  'highlight',
  'light',
  'mid',
  'shadow',
  'outline',
  'eye',
  'eyeHi',
]

describe('ORB_SKINS 皮肤注册表', () => {
  it('包含 v3/v4 两款皮肤，label 为中文名', () => {
    expect(Object.keys(ORB_SKINS).sort()).toEqual(['v3', 'v4'])
    expect(ORB_SKINS.v4.label).toBe('长春花蓝')
    expect(ORB_SKINS.v3.label).toBe('薄荷青')
  })

  it('DEFAULT_ORB_SKIN 为 v3', () => {
    expect(DEFAULT_ORB_SKIN).toBe('v3')
  })

  it('每款皮肤的 palette 覆盖全部语义键且为 hex 颜色', () => {
    for (const skin of Object.values(ORB_SKINS)) {
      for (const key of ALL_PALETTE_KEYS) {
        expect(skin.palette[key], `${skin.id} 缺少 palette 键 '${key}'`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })
})

describe('spherePixel（§9.1 SDF）', () => {
  it('球心在内、dist=半径、法线为零', () => {
    const s = spherePixel(64, 64, 64, 64, 62)
    expect(s.inside).toBe(true)
    expect(s.dist).toBeCloseTo(62, 6)
    expect(s.nx).toBe(0)
    expect(s.ny).toBe(0)
  })

  it('边界上与边界外的内外判定', () => {
    expect(spherePixel(64 + 62, 64, 64, 64, 62).inside).toBe(true)
    expect(spherePixel(64 + 62, 64, 64, 64, 62).dist).toBeCloseTo(0, 6)
    expect(spherePixel(64 + 63, 64, 64, 64, 62).inside).toBe(false)
    expect(spherePixel(64 + 63, 64, 64, 64, 62).dist).toBeCloseTo(-1, 6)
  })

  it('法线分量范围：球内 nx²+ny² ≤ 1，任意点 |nx|,|ny| ≤ 1 随距离等比放大', () => {
    for (const [x, y] of [
      [64, 64],
      [70, 50],
      [100, 100],
      [10, 120],
      [126, 2],
    ]) {
      const s = spherePixel(x, y, 64, 64, 62)
      if (s.inside) {
        expect(s.nx * s.nx + s.ny * s.ny).toBeLessThanOrEqual(1 + 1e-9)
      }
      expect(Math.abs(s.nx)).toBeCloseTo(Math.abs(x - 64) / 62, 6)
      expect(Math.abs(s.ny)).toBeCloseTo(Math.abs(y - 64) / 62, 6)
    }
  })
})

describe('sphereShade（§2.2 法线光照）', () => {
  it('输出恒在 0~1', () => {
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const nx = -1 + i / 10
        const ny = -1 + j / 10
        const s = sphereShade(nx, ny)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(1)
      }
    }
  })

  it('光源来自左上：左上法线显著亮于右下', () => {
    expect(sphereShade(-0.4, -0.4)).toBeGreaterThan(sphereShade(0.4, 0.4) + 0.2)
  })
})

describe('quantizeShade（§9.2 五级色阶）', () => {
  it('五档输出与严格大于边界', () => {
    expect(quantizeShade(1)).toBe('highlight')
    expect(quantizeShade(0.851)).toBe('highlight')
    expect(quantizeShade(0.85)).toBe('light') // 严格 > 0.85
    expect(quantizeShade(0.601)).toBe('light')
    expect(quantizeShade(0.6)).toBe('mid')
    expect(quantizeShade(0.351)).toBe('mid')
    expect(quantizeShade(0.35)).toBe('shadow')
    expect(quantizeShade(0.151)).toBe('shadow')
    expect(quantizeShade(0.15)).toBe('outline')
    expect(quantizeShade(0)).toBe('outline')
    expect(quantizeShade(-1)).toBe('outline')
  })
})

describe('rasterizeBody 球体栅格', () => {
  it('128×128，角落透明、球心有像素', () => {
    const body = rasterizeBody()
    expect(body.length).toBe(ORB_GRID * ORB_GRID)
    expect(body[0]).toBeNull()
    expect(body[ORB_GRID - 1]).toBeNull()
    expect(body[Math.round(ORB_CY) * ORB_GRID + Math.round(ORB_CX)]).not.toBeNull()
  })

  it('明度色阶 ≥3 级（实际 5 级全在，§2.5/§11 体积感）', () => {
    const keys = new Set(rasterizeBody().filter((k) => k !== null))
    for (const key of ['highlight', 'light', 'mid', 'shadow', 'outline'] as OrbPaletteKey[]) {
      expect(keys.has(key), `缺少色阶 '${key}'`).toBe(true)
    }
  })

  it('轮廓环贴在球面上（最外非空像素距球心 ≤ 半径 + 1 格）', () => {
    const body = rasterizeBody()
    for (let y = 0; y < ORB_GRID; y++) {
      for (let x = 0; x < ORB_GRID; x++) {
        if (body[y * ORB_GRID + x] === null) continue
        const d = Math.hypot(x + 0.5 - ORB_CX, y + 0.5 - ORB_CY)
        expect(d).toBeLessThanOrEqual(ORB_RADIUS + 1)
      }
    }
  })
})

describe('composeOrb 帧组装', () => {
  it('输出确定性：同参数两次结果一致（固定时间）', () => {
    for (const state of ALL_STATES) {
      const opts = {
        state,
        tier: 'full' as OrbTier,
        time: 1.234,
        pupilX: 2,
        pupilY: 1,
        hiX: 1,
        hiY: 0.5,
        lid: 0,
      }
      expect(composeOrb(opts)).toEqual(composeOrb(opts))
    }
  })

  it('palette 键完整性：全部状态 × 档位 × 皮肤的栅格键都在 palette 中', () => {
    const body = rasterizeBody()
    const used = new Set<OrbPaletteKey>()
    for (const state of ALL_STATES) {
      for (const tier of ALL_TIERS) {
        const raster = composeOrb({
          state,
          tier,
          time: 0.7,
          pupilX: 3,
          pupilY: 2,
          hiX: 1.5,
          hiY: 1,
          lid: 0.5,
          body,
        })
        for (const key of raster) {
          if (key !== null) used.add(key)
        }
      }
    }
    expect(used.size).toBeGreaterThan(0)
    for (const key of used) {
      for (const skinId of ALL_SKINS) {
        expect(
          ORB_SKINS[skinId].palette[key],
          `栅格用到键 '${key}' 但 ${skinId} palette 缺失`,
        ).toBeTruthy()
      }
    }
  })

  it('各状态眼睛不越界：极端 gaze/lid 下非空像素仍在球体内且不抛错', () => {
    const body = rasterizeBody()
    const extremes = [
      { pupilX: 100, pupilY: 100, hiX: 100, hiY: 100 },
      { pupilX: -100, pupilY: -100, hiX: -100, hiY: -100 },
      { pupilX: 0, pupilY: 0, hiX: 0, hiY: 0 },
    ]
    let maxD = 0
    let checked = 0
    for (const state of ALL_STATES) {
      for (const tier of ALL_TIERS) {
        for (const gaze of extremes) {
          for (const lid of [0, 0.5, 1]) {
            const raster = composeOrb({ state, tier, time: 99.9, lid, body, ...gaze })
            expect(raster.length).toBe(ORB_GRID * ORB_GRID)
            for (let y = 0; y < ORB_GRID; y++) {
              for (let x = 0; x < ORB_GRID; x++) {
                if (raster[y * ORB_GRID + x] === null) continue
                checked++
                const d = Math.hypot(x + 0.5 - ORB_CX, y + 0.5 - ORB_CY)
                if (d > maxD) maxD = d
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(maxD).toBeLessThanOrEqual(ORB_RADIUS + 1)
  })

  it('状态信号差异：waiting 有扫描亮段、sleeping 无高光、error 有断裂信号', () => {
    const waiting = composeOrb({ state: 'waiting', tier: 'full', time: 0.7 })
    expect(waiting.includes('eyeHi')).toBe(true)
    const sleeping = composeOrb({ state: 'sleeping', tier: 'full' })
    expect(sleeping.includes('eyeHi')).toBe(false)
    expect(sleeping.includes('eye')).toBe(false) // 闭眼横线用 outline，无瞳孔
    const error = composeOrb({ state: 'error', tier: 'full' })
    expect(error.includes('eye')).toBe(true)
    const idle = composeOrb({ state: 'idle', tier: 'full' })
    expect(idle.includes('eyeHi')).toBe(true) // 睁眼有高光点
  })

  it('眨眼全闭（lid=1）后瞳孔/高光消失', () => {
    const closed = composeOrb({ state: 'idle', tier: 'full', lid: 1 })
    expect(closed.includes('eyeHi')).toBe(false)
    expect(closed.includes('eye')).toBe(false)
  })
})

describe('rasterToRgba 上屏', () => {
  it('输出 RGBA 长度与透明度', () => {
    const rgba = rasterToRgba(rasterizeBody(), resolvePalette(ORB_SKINS.v4.palette))
    expect(rgba.length).toBe(ORB_GRID * ORB_GRID * 4)
    expect(rgba[3]).toBe(0) // 角落透明
    const center = (Math.round(ORB_CY) * ORB_GRID + Math.round(ORB_CX)) * 4
    expect(rgba[center + 3]).toBe(255)
  })

  it('resolvePalette 正确解析 hex', () => {
    const resolved = resolvePalette(ORB_SKINS.v4.palette)
    expect(resolved.mid).toEqual([0x8d, 0x92, 0xe6])
    expect(resolved.eyeHi).toEqual([0xff, 0xff, 0xff])
  })
})

describe('size 契约（§2.2/§7.1）', () => {
  it('合法 size 恰好为 256/128/64/32', () => {
    expect([...ORB_LEGAL_SIZES].sort((a, b) => a - b)).toEqual([32, 64, 128, 256])
    for (const size of [32, 64, 128, 256]) expect(isValidOrbSize(size)).toBe(true)
    for (const size of [0, 16, 40, 96, 512, -64, 64.5]) expect(isValidOrbSize(size)).toBe(false)
  })

  it('orbUnit 倍率与档位映射', () => {
    expect(orbUnit(32)).toBe(0.25)
    expect(orbUnit(64)).toBe(0.5)
    expect(orbUnit(128)).toBe(1)
    expect(orbUnit(256)).toBe(2)
    expect(orbTier(256)).toBe('full')
    expect(orbTier(128)).toBe('clear')
    expect(orbTier(64)).toBe('simple')
    expect(orbTier(32)).toBe('icon')
  })

  it('非法 size 在 DEV throw', () => {
    expect(() => orbUnit(40)).toThrow(/256\/128\/64\/32/)
    expect(() => renderToStaticMarkup(<PixelOrb size={96} />)).toThrow(/256\/128\/64\/32/)
  })
})

describe('gaze 视线跟随（§2.4/§9.3）', () => {
  const DIAMETER = ORB_RADIUS * 2

  it('零输入 → 全部归零', () => {
    const g = computeGaze(0, 0, DIAMETER)
    expect(g).toEqual({ x: 0, y: 0, pupilX: 0, pupilY: 0, hiX: 0, hiY: 0, tiltDeg: 0 })
  })

  it('偏移范围限幅在 球径 × 0.12 内，方向跟随鼠标', () => {
    const max = DIAMETER * GAZE_RANGE_RATIO
    for (const [dx, dy] of [
      [GAZE_SATURATION_PX, 0],
      [0, GAZE_SATURATION_PX],
      [-150, 80],
      [9999, -9999],
    ]) {
      const g = computeGaze(dx, dy, DIAMETER)
      expect(Math.hypot(g.x, g.y)).toBeLessThanOrEqual(max + 1e-9)
      if (dx !== 0) expect(Math.sign(g.x)).toBe(Math.sign(dx))
      if (dy !== 0) expect(Math.sign(g.y)).toBe(Math.sign(dy))
    }
  })

  it('高光与瞳孔同向、幅度更小', () => {
    const g = computeGaze(120, 90, DIAMETER)
    expect(Math.sign(g.hiX)).toBe(Math.sign(g.pupilX))
    expect(Math.sign(g.hiY)).toBe(Math.sign(g.pupilY))
    expect(Math.hypot(g.hiX, g.hiY)).toBeLessThan(Math.hypot(g.pupilX, g.pupilY))
  })

  it('越界后转为球体微倾：水平 0~3°，纯垂直不倾，倾斜随超出行程单调', () => {
    const saturated = computeGaze(GAZE_SATURATION_PX, 0, DIAMETER)
    expect(saturated.tiltDeg).toBe(0) // 恰好饱和不倾
    const over = computeGaze(GAZE_SATURATION_PX * 2, 0, DIAMETER)
    expect(over.tiltDeg).toBeCloseTo(GAZE_TILT_MAX_DEG, 6)
    expect(Math.abs(over.tiltDeg)).toBeLessThanOrEqual(GAZE_TILT_MAX_DEG)
    const overLeft = computeGaze(-GAZE_SATURATION_PX * 2, 0, DIAMETER)
    expect(overLeft.tiltDeg).toBeCloseTo(-GAZE_TILT_MAX_DEG, 6)
    const vertical = computeGaze(0, GAZE_SATURATION_PX * 3, DIAMETER)
    expect(vertical.tiltDeg).toBe(0)
    const half = computeGaze(GAZE_SATURATION_PX * 1.5, 0, DIAMETER)
    expect(half.tiltDeg).toBeGreaterThan(0)
    expect(half.tiltDeg).toBeLessThan(GAZE_TILT_MAX_DEG)
  })

  it('弹簧回归：0.5s 内收敛到中心（§2.4）', () => {
    let spring = { value: 10, velocity: 0 }
    for (let i = 0; i < 30; i++) {
      spring = springStep(spring, 0, 1 / 60) // 30 帧 = 0.5s
    }
    expect(Math.abs(spring.value)).toBeLessThan(0.5)
  })

  it('弹簧对异常 dt 不发散', () => {
    let spring = { value: 5, velocity: 2 }
    spring = springStep(spring, 0, -1)
    spring = springStep(spring, 0, 100)
    expect(Number.isFinite(spring.value)).toBe(true)
    expect(Number.isFinite(spring.velocity)).toBe(true)
  })
})

describe('blink 眨眼（§2.2/§2.5：上眼睑下扫 ≤3 帧）', () => {
  it('时序为 3 帧：半闭 → 全闭 → 半闭 → 睁开', () => {
    expect(BLINK_FRAMES).toBeLessThanOrEqual(3)
    expect(blinkLid(0)).toBe(0.5)
    expect(blinkLid(1 / 60 + 1e-4)).toBe(1)
    expect(blinkLid(2 / 60 + 1e-4)).toBe(0.5)
    expect(blinkLid(3 / 60 + 1e-4)).toBe(0)
    expect(blinkLid(-0.1)).toBe(0)
  })
})

describe('横向信号视窗（v2.8：无圆眼 / 无圆瞳孔）', () => {
  it('full/clear/simple 档 idle 由双矩形信号段组成', () => {
    for (const tier of ['full', 'clear', 'simple'] as OrbTier[]) {
      const raster = composeOrb({ state: 'idle', tier, pupilX: 0, pupilY: 0, hiX: 0, hiY: 0 })
      const count = raster.filter((k) => k === 'eyeHi').length
      expect(count, `${tier} 档应有两枚 7×4 矩形信号段`).toBe(56)
    }
  })

  it('icon 档（32px）收束为单枚 8×2 横向信号条', () => {
    const raster = composeOrb({ state: 'idle', tier: 'icon' })
    expect(raster.filter((k) => k === 'eyeHi')).toHaveLength(16)
  })

  it('信号段随 gaze 整体横移，面积不变且不越出球体', () => {
    const centered = composeOrb({ state: 'idle', tier: 'full' })
    const shifted = composeOrb({
      state: 'idle',
      tier: 'full',
      pupilX: 3,
      pupilY: 2,
      hiX: 1.5,
      hiY: 1,
    })
    const centroidX = (raster: ReturnType<typeof composeOrb>) => {
      let count = 0
      let sum = 0
      for (let y = 0; y < ORB_GRID; y++) {
        for (let x = 0; x < ORB_GRID; x++) {
          if (raster[y * ORB_GRID + x] !== 'eyeHi') continue
          count++
          sum += x
        }
      }
      return sum / count
    }
    expect(shifted.filter((k) => k === 'eyeHi')).toHaveLength(56)
    expect(centroidX(shifted)).toBeGreaterThan(centroidX(centered))
    for (let y = 0; y < ORB_GRID; y++) {
      for (let x = 0; x < ORB_GRID; x++) {
        if (shifted[y * ORB_GRID + x] !== 'eyeHi') continue
        const d = Math.hypot(x + 0.5 - ORB_CX, y + 0.5 - ORB_CY)
        expect(d).toBeLessThanOrEqual(ORB_RADIUS + 1)
      }
    }
  })
})

describe('PixelOrb 组件渲染', () => {
  it.each(ALL_STATES)('state=%s 渲染出 canvas', (state) => {
    const html = renderToStaticMarkup(<PixelOrb state={state} size={128} />)
    expect(html).toContain('<canvas')
    expect(html).toContain(`data-state="${state}"`)
  })

  it('无 props 默认渲染：idle / 64px / 全局皮肤兜底', () => {
    const html = renderToStaticMarkup(<PixelOrb />)
    expect(html).toContain('<canvas')
    expect(html).toContain('data-state="idle"')
    expect(html).toContain('width:64px')
  })

  it.each(ALL_SKINS)('skin=%s 渲染不报错', (skin) => {
    expect(renderToStaticMarkup(<PixelOrb skin={skin} state="success" size={64} />)).toContain(
      '<canvas',
    )
  })

  it.each([32, 64, 128, 256])('合法 size=%i 渲染不报错', (size) => {
    expect(renderToStaticMarkup(<PixelOrb size={size} gaze />)).toContain('<canvas')
  })
})
