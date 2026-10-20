import { describe, expect, it } from 'vitest'

import { rolePanelFits } from './useRolePanelWidth'

describe('role panels respond to remaining content width', () => {
  it('collapses the locator and moves the inspector at a narrow desktop content width', () => {
    expect(rolePanelFits(736, 16, 'locator')).toBe(false)
    expect(rolePanelFits(736, 16, 'inspector')).toBe(false)
  })

  it('allows an adjacent inspector before there is room for the locator as well', () => {
    expect(rolePanelFits(992, 16, 'locator')).toBe(false)
    expect(rolePanelFits(992, 16, 'inspector')).toBe(true)
    expect(rolePanelFits(1152, 16, 'locator')).toBe(true)
  })

  it('preserves readable space when the root text scale changes', () => {
    expect(rolePanelFits(992, 20, 'inspector')).toBe(false)
    expect(rolePanelFits(1000, 20, 'inspector')).toBe(true)
  })
})
