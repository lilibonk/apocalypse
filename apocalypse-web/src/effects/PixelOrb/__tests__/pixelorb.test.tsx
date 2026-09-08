/** PixelOrb 直接使用批准设计稿状态母版的契约。 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  MINT_BONK_SHEET_COLUMNS,
  MINT_BONK_SHEET_ROWS,
  MINT_BONK_SOURCE_CELL_SIZE,
  MINT_BONK_SPRITE_SHEET,
  ORB_LEGAL_SIZES,
  ORB_STATE_CELLS,
  PixelOrb,
  isValidOrbSize,
  orbTier,
  orbUnit,
} from '..'
import type { OrbState, SkinId } from '..'

const ALL_STATES: OrbState[] = ['idle', 'waiting', 'success', 'error', 'sleeping']
const LEGACY_SKINS: SkinId[] = ['v3', 'v4']

describe('批准设计稿状态母版', () => {
  it('固定使用 1536×1024 的 3×2 透明图，每格 512×512', () => {
    expect(MINT_BONK_SPRITE_SHEET).toBe('/brand/mint-bonk-design-sprites-v1.png')
    expect(MINT_BONK_SHEET_COLUMNS).toBe(3)
    expect(MINT_BONK_SHEET_ROWS).toBe(2)
    expect(MINT_BONK_SOURCE_CELL_SIZE).toBe(512)
  })

  it('五个运行状态准确映射到设计稿位置，背面设定不进入产品状态', () => {
    expect(ORB_STATE_CELLS).toEqual({
      idle: { column: 0, row: 0 },
      waiting: { column: 1, row: 0 },
      success: { column: 2, row: 0 },
      error: { column: 0, row: 1 },
      sleeping: { column: 1, row: 1 },
    })
    expect(Object.keys(ORB_STATE_CELLS)).toEqual(ALL_STATES)
  })
})

describe('尺寸契约', () => {
  it('允许 32/64/128/256/384 五档', () => {
    expect([...ORB_LEGAL_SIZES].sort((a, b) => a - b)).toEqual([32, 64, 128, 256, 384])
    expect(orbUnit(32)).toBe(1)
    expect(orbUnit(64)).toBe(2)
    expect(orbUnit(128)).toBe(4)
    expect(orbUnit(256)).toBe(8)
    expect(orbTier(256)).toBe('full')
    expect(orbTier(128)).toBe('clear')
    expect(orbTier(64)).toBe('simple')
    expect(orbTier(32)).toBe('icon')
    for (const size of ORB_LEGAL_SIZES) expect(isValidOrbSize(size)).toBe(true)
  })

  it('非法尺寸在开发环境抛错', () => {
    expect(() => orbUnit(40)).toThrow(/256\/128\/64\/32/)
    expect(() => renderToStaticMarkup(<PixelOrb size={96} />)).toThrow(/256\/128\/64\/32/)
  })
})

describe('PixelOrb 新品牌兼容入口', () => {
  it.each(ALL_STATES)('state=%s 的 SSR 与小尺寸是同角色静态海报', (state) => {
    const html = renderToStaticMarkup(<PixelOrb state={state} size={128} />)
    expect(html).toContain('data-mascot="mint-slime"')
    expect(html).toContain(`data-state="${state}"`)
    expect(html).toContain(`src="/brand/slime/${state}.png"`)
    expect(html).toContain(`src="/brand/slime/dark-${state}.png"`)
    expect(html).toContain('data-motion="off"')
    expect(html).not.toContain('<canvas')
    expect(html).not.toContain('mint-bonk')
    expect(html).not.toContain('pixelated')
  })
  it('384px 大舞台 SSR 不访问浏览器或申请 GPU', () => {
    const html = renderToStaticMarkup(<PixelOrb size={384} />)
    expect(html).toContain('width:384px')
    expect(html).not.toContain('<canvas')
  })
  it.each(LEGACY_SKINS)('skin=%s 不改变新品牌颜色与形象', (skin) => {
    const html = renderToStaticMarkup(<PixelOrb skin={skin} size={64} gaze />)
    expect(html).toContain('src="/brand/slime/idle.png"')
    expect(html).not.toContain('mint-bonk')
  })
})
