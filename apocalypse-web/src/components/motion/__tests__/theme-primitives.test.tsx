import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  themeWorld: 'fluid' as 'fluid' | 'sketchbook' | 'obsidian',
  authorizedPath: '/system/role' as string | undefined,
  motionAllowed: true,
}))

vi.mock('@/stores/settings', async (original) => {
  const settings = await original<typeof import('@/stores/settings')>()
  return {
    ...settings,
    useSettings: () => ({ ...settings.DEFAULT_SETTINGS, themeWorld: mockState.themeWorld }),
  }
})
vi.mock('@/hooks/useMotionPreference', () => ({
  useMotionPreference: () => mockState.motionAllowed,
}))
vi.mock('@/hooks/useMenuRoute', () => ({
  useMenuRoute: () => mockState.authorizedPath,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}))

import {
  ApoParticleOrb,
  FluidConduitOverlay,
  SketchApoPeeker,
  SketchBox,
  SvgThemeFilters,
  buildSketchPaths,
  buildTwinBankRiver,
  sampleCubic,
} from '@/components/motion'
import { EntityPeekLink } from '@/components/navigation'

beforeEach(() => {
  mockState.themeWorld = 'fluid'
  mockState.authorizedPath = '/system/role'
  mockState.motionAllowed = true
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('procedural zero-bitmap visual primitives', () => {
  it('renders global shared SVG watercolor filters and theme-world gradients without hardcoding colors', () => {
    const html = renderToStaticMarkup(<SvgThemeFilters />)
    expect(html).toContain('id="watercolor-bleed"')
    expect(html).toContain('id="apo-sketch-ink"')
    expect(html).toContain('id="apo-river-grad"')
    expect(html).toContain('id="apo-glass-pipe-grad"')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}|oklch\(|rgba?\(/)
  })

  it('produces deterministic double-stroke ink outlines for SketchBox and normal-offset twin-bank rivers', () => {
    const first = buildSketchPaths(320, 140, 17)
    const second = buildSketchPaths(320, 140, 17)
    const shifted = buildSketchPaths(320, 140, 31)
    expect(first).toEqual(second)
    expect(first.primary).toBeTruthy()
    expect(first.secondary).toBeTruthy()
    expect(first.primary).not.toBe(shifted.primary)
    expect(buildSketchPaths(4, 4, 17)).toEqual({ primary: '', secondary: '' })

    const points = sampleCubic(0, 0, 40, 0, 80, 40, 120, 40, 12)
    expect(points).toHaveLength(13)
    const river = buildTwinBankRiver(0, 0, 40, 0, 80, 40, 120, 40, 7.5)
    expect(river.riverPoly).toMatch(/^M .+ Z$/)
    expect(river.topBank).toMatch(/^M /)
    expect(river.bottomBank).toMatch(/^M /)
  })

  it('keeps SketchBox content crisp above isolated wash layer', () => {
    mockState.themeWorld = 'sketchbook'
    const html = renderToStaticMarkup(
      <SketchBox seed={17} wash="wide" washiTape>
        <span>核心正文</span>
      </SketchBox>,
    )
    expect(html).toContain('data-slot="sketch-box"')
    expect(html).toContain('data-wash="wide"')
    expect(html).toContain('data-slot="sketch-washi-tape"')
    expect(html).toContain('class="crisp-content"')

    mockState.themeWorld = 'fluid'
    const fluidHtml = renderToStaticMarkup(
      <SketchBox seed={17} wash="normal" washiTape>
        <span>核心正文</span>
      </SketchBox>,
    )
    expect(fluidHtml).not.toContain('data-slot="sketch-washi-tape"')
  })

  it('renders FluidConduitOverlay, ApoParticleOrb, and SketchApoPeeker safely in SSR / zero idle motion', () => {
    const ref = createRef<HTMLDivElement>()
    const overlay = renderToStaticMarkup(
      <FluidConduitOverlay containerRef={ref} links={[{ id: 'a', from: 'x', to: 'y' }]} />,
    )
    expect(overlay).toContain('data-slot="fluid-conduit-overlay"')
    expect(overlay).toContain('data-world="fluid"')

    const orb = renderToStaticMarkup(<ApoParticleOrb size={24} active={false} />)
    expect(orb).toContain('data-slot="apo-particle-orb"')
    expect(orb).toContain('data-active="false"')

    const peeker = renderToStaticMarkup(<SketchApoPeeker />)
    expect(peeker).toContain('data-slot="sketch-apo-peeker"')
  })

  it('renders EntityPeekLink as an interactive HoverCard trigger when authorized and degrades cleanly when denied', () => {
    const authorized = renderToStaticMarkup(
      <MemoryRouter>
        <EntityPeekLink kind="role" id="1" label="安全审计" sublabel="sec_auditor" />
      </MemoryRouter>,
    )
    expect(authorized).toContain('data-slot="entity-peek-link"')
    expect(authorized).toContain('data-interactive="true"')
    expect(authorized).toContain('<button')

    mockState.authorizedPath = undefined
    const denied = renderToStaticMarkup(
      <MemoryRouter>
        <EntityPeekLink kind="role" id="1" label="安全审计" sublabel="sec_auditor" />
      </MemoryRouter>,
    )
    expect(denied).toContain('data-interactive="false"')
    expect(denied).not.toContain('<button')
  })
})
