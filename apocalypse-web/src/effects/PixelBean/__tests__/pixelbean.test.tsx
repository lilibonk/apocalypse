/**
 * PixelBean 契约：128 栅格、调色板键、pose、size（64 的倍数）。
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  BEAN_NATIVE_WIDTH,
  PIXEL_KEYS,
  PX,
  PixelBean,
  SKINS,
  DEFAULT_SKIN,
  beanUnit,
  cachedRaster,
  composeFrame,
  composeTide,
  isValidBeanSize,
  poseForState,
} from '..'
import { TIDE_H, TIDE_W } from '../draw'
import type { BeanState, SkinId } from '..'
import type { PoseId } from '../draw'

const ALL_STATES: BeanState[] = [
  'idle',
  'waiting',
  'loading',
  'thinking',
  'success',
  'error',
  'sleeping',
]

const ALL_POSES: PoseId[] = ['idle', 'blink', 'success', 'error', 'sleeping', 'flat', 'mini']

describe('SKINS 皮肤注册表', () => {
  it('包含 v3/v4 两款皮肤且 label 非空', () => {
    expect(Object.keys(SKINS).sort()).toEqual(['v3', 'v4'])
    for (const skin of Object.values(SKINS)) {
      expect(skin.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('DEFAULT_SKIN 为 v4', () => {
    expect(DEFAULT_SKIN).toBe('v4')
  })

  it('每款皮肤的 palette 覆盖全部像素语义键', () => {
    for (const skin of Object.values(SKINS)) {
      for (const key of Object.values(PIXEL_KEYS)) {
        expect(skin.palette[key], `${skin.id} 缺少 palette 键 '${key}'`).toBeTruthy()
      }
    }
  })
})

describe('128×128 栅格', () => {
  it('每个 pose 为 128×128 且含非空像素', () => {
    for (const pose of ALL_POSES) {
      const { body, gaze } = cachedRaster(pose)
      expect(body.length).toBe(BEAN_NATIVE_WIDTH * BEAN_NATIVE_WIDTH)
      expect(gaze.length).toBe(body.length)
      expect([...body].some((value) => value !== PX.empty)).toBe(true)
    }
  })

  it('所有非空索引都能映射到 palette 键', () => {
    for (const pose of ALL_POSES) {
      const { body, gaze } = cachedRaster(pose)
      for (const buf of [body, gaze]) {
        for (const value of buf) {
          if (value === PX.empty) continue
          expect(PIXEL_KEYS[value], `未映射索引 ${value} @ ${pose}`).toBeDefined()
        }
      }
    }
  })

  it('idle 有瞳孔层，blink/success/error/sleeping 无瞳孔', () => {
    expect([...cachedRaster('idle').gaze].some((value) => value === PX.pupil)).toBe(true)
    expect([...cachedRaster('blink').gaze].some((value) => value !== PX.empty)).toBe(false)
    expect([...cachedRaster('success').gaze].some((value) => value !== PX.empty)).toBe(false)
    expect([...cachedRaster('error').gaze].some((value) => value !== PX.empty)).toBe(false)
    expect([...cachedRaster('sleeping').gaze].some((value) => value !== PX.empty)).toBe(false)
  })

  it('idle 含描边、填充、星核', () => {
    const { body } = cachedRaster('idle')
    const set = new Set(body)
    expect(set.has(PX.outline)).toBe(true)
    expect(set.has(PX.fill)).toBe(true)
    expect(set.has(PX.core)).toBe(true)
  })

  it('composeFrame 带水流时间仍输出 128×128 RGBA', () => {
    const rgba = composeFrame({
      pose: 'idle',
      palette: SKINS.v4.palette,
      time: 1.2,
      flowAmp: 0.8,
    })
    expect(rgba.length).toBe(BEAN_NATIVE_WIDTH * BEAN_NATIVE_WIDTH * 4)
    expect([...rgba].some((value) => value !== 0)).toBe(true)
  })

  it('composeTide 输出水面栅格', () => {
    const rgba = composeTide(SKINS.v4.palette, 0.8)
    expect(rgba.length).toBe(TIDE_W * TIDE_H * 4)
    expect([...rgba].some((value) => value !== 0)).toBe(true)
  })

  it('poseForState 覆盖状态词表', () => {
    expect(poseForState('idle', false)).toBe('idle')
    expect(poseForState('idle', true)).toBe('blink')
    expect(poseForState('success', false)).toBe('success')
    expect(poseForState('error', false)).toBe('error')
    expect(poseForState('sleeping', false)).toBe('sleeping')
    expect(ALL_STATES).toHaveLength(7)
  })
})

describe('PixelBean 渲染', () => {
  it.each(ALL_STATES)('state=%s 渲染出 canvas', (state) => {
    const html = renderToStaticMarkup(<PixelBean state={state} size={128} />)
    expect(html).toContain('<canvas')
  })

  it('无 props 默认渲染不报错', () => {
    expect(renderToStaticMarkup(<PixelBean />)).toContain('<canvas')
  })

  it.each(['v3', 'v4'] as SkinId[])('skin=%s 渲染不报错', (skin) => {
    expect(renderToStaticMarkup(<PixelBean skin={skin} state="success" size={128} />)).toContain(
      '<canvas',
    )
  })
})

describe('PixelBean size 契约', () => {
  it('64 的倍数合法（0.5× / 1× / 2× / 4×）', () => {
    expect(isValidBeanSize(64)).toBe(true)
    expect(isValidBeanSize(128)).toBe(true)
    expect(isValidBeanSize(256)).toBe(true)
    expect(isValidBeanSize(512)).toBe(true)
    expect(beanUnit(64)).toBe(0.5)
    expect(beanUnit(128)).toBe(1)
    expect(beanUnit(512)).toBe(4)
  })

  it('拒绝非 64 倍数', () => {
    expect(isValidBeanSize(32)).toBe(false)
    expect(isValidBeanSize(40)).toBe(false)
    expect(isValidBeanSize(96)).toBe(false)
    expect(isValidBeanSize(0)).toBe(false)
  })

  it('非法 size 在 DEV 渲染时 throw', () => {
    expect(() => renderToStaticMarkup(<PixelBean size={40} />)).toThrow(/正整数倍/)
  })
})
