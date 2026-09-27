/** 当前角色的五状态、尺寸校验与静态降级契约。 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ORB_LEGAL_SIZES, PixelOrb, isValidOrbSize, orbUnit } from '..'
import type { OrbState } from '..'

const ALL_STATES: OrbState[] = ['idle', 'waiting', 'success', 'error', 'sleeping']

describe('尺寸契约', () => {
  it('允许 32/64/128/256/384 五档', () => {
    expect([...ORB_LEGAL_SIZES].sort((a, b) => a - b)).toEqual([32, 64, 128, 256, 384])
    expect(orbUnit(32)).toBe(1)
    expect(orbUnit(64)).toBe(2)
    expect(orbUnit(128)).toBe(4)
    expect(orbUnit(256)).toBe(8)
    for (const size of ORB_LEGAL_SIZES) expect(isValidOrbSize(size)).toBe(true)
  })

  it('非法尺寸在开发环境抛错', () => {
    expect(() => orbUnit(40)).toThrow(/256\/128\/64\/32/)
    expect(() => renderToStaticMarkup(<PixelOrb size={96} />)).toThrow(/256\/128\/64\/32/)
  })
})

describe('PixelOrb 当前角色入口', () => {
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
})
