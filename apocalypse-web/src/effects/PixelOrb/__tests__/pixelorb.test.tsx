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
  it('只允许 32/64/128/256 四档', () => {
    expect([...ORB_LEGAL_SIZES].sort((a, b) => a - b)).toEqual([32, 64, 128, 256])
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

describe('PixelOrb 设计稿裁切', () => {
  it.each(ALL_STATES)('state=%s 使用图片而不是 Canvas 或代码栅格', (state) => {
    const html = renderToStaticMarkup(<PixelOrb state={state} size={128} />)
    expect(html).toContain('data-mascot="mint-bonk"')
    expect(html).toContain(`data-state="${state}"`)
    expect(html).toContain('<img')
    expect(html).toContain('src="/brand/mint-bonk-design-sprites-v1.png"')
    expect(html).not.toContain('<canvas')
  })

  it('waiting 以 128px 单格裁切母版上排中间帧', () => {
    const html = renderToStaticMarkup(<PixelOrb state="waiting" size={128} />)
    expect(html).toContain('width:384px')
    expect(html).toContain('height:256px')
    expect(html).toContain('left:-128px')
    expect(html).toContain('top:0')
    expect(html).toContain('image-rendering:pixelated')
  })

  it('sleeping 以 128px 单格裁切母版下排中间帧', () => {
    const html = renderToStaticMarkup(<PixelOrb state="sleeping" size={128} />)
    expect(html).toContain('left:-128px')
    expect(html).toContain('top:-128px')
  })

  it('idle gaze 从批准素材裁出两枚原稿高光与两枚遮盖片', () => {
    const html = renderToStaticMarkup(<PixelOrb state="idle" size={256} gaze />)
    expect(html.match(/data-slot="mint-bonk-gaze-cover"/g)).toHaveLength(2)
    expect(html.match(/data-slot="mint-bonk-gaze-glint"/g)).toHaveLength(2)
    expect(html).toContain('data-gaze="enabled"')
    expect(html).not.toContain('<canvas')
  })

  it('非 idle 状态不挂载视线裁片', () => {
    const html = renderToStaticMarkup(<PixelOrb state="waiting" size={256} gaze />)
    expect(html).not.toContain('mint-bonk-gaze-glint')
    expect(html).not.toContain('mint-bonk-gaze-cover')
  })

  it.each(LEGACY_SKINS)('skin=%s 仅保留调用兼容，不改变批准素材', (skin) => {
    const html = renderToStaticMarkup(<PixelOrb skin={skin} size={64} gaze />)
    expect(html).toContain(`data-skin="${skin}"`)
    expect(html).toContain('src="/brand/mint-bonk-design-sprites-v1.png"')
  })
})
