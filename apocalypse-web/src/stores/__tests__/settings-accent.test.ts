/**
 * 皮肤 ↔ accent 联动表（DEFINITION §2）。不启动 persist，只测纯映射。
 */

import { describe, expect, it } from 'vitest'

import { ACCENT_SKIN, SKIN_ACCENT } from '../settings'

describe('SKIN_ACCENT / ACCENT_SKIN', () => {
  it('v4 ↔ periwinkle，v3 ↔ mint', () => {
    expect(SKIN_ACCENT.v4).toBe('periwinkle')
    expect(SKIN_ACCENT.v3).toBe('mint')
    expect(ACCENT_SKIN.periwinkle).toBe('v4')
    expect(ACCENT_SKIN.mint).toBe('v3')
  })

  it('其它 accent 不映射皮肤', () => {
    expect(ACCENT_SKIN.violet).toBeUndefined()
    expect(ACCENT_SKIN.mono).toBeUndefined()
  })
})
