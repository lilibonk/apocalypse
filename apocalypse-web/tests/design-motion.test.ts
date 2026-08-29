import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { motionDuration, motionSequence } from '../src/design/motion'

const tokensCss = readFileSync(new URL('../src/design/tokens.css', import.meta.url), 'utf8')
const pixelSurfaceReveal = readFileSync(
  new URL('../src/components/motion/PixelSurfaceReveal.tsx', import.meta.url),
  'utf8',
)
const layerComponents = ['dialog.tsx', 'alert-dialog.tsx', 'sheet.tsx'].map((file) =>
  readFileSync(new URL(`../src/components/ui/${file}`, import.meta.url), 'utf8'),
)

describe('pixel motion contract', () => {
  it('separates shell assembly from readable CRUD content beats', () => {
    const threePhaseDuration =
      motionSequence.delay + motionSequence.stagger * 2 + motionDuration.content

    expect(motionSequence.delay).toBeGreaterThanOrEqual(0.4)
    expect(motionDuration.surfaceReveal).toBeGreaterThan(motionDuration.layer)
    expect(threePhaseDuration).toBeGreaterThanOrEqual(0.75)
    expect(threePhaseDuration).toBeLessThanOrEqual(0.95)
    expect(motionDuration.exit).toBeLessThan(motionDuration.layer)
    expect(tokensCss).toContain('--motion-duration-content: 240ms')
    expect(tokensCss).toContain('--motion-delay-sequence: 460ms')
    expect(tokensCss).toContain('--motion-stagger-sequence: 70ms')
  })

  it('defines executable animation names for every base floating layer', () => {
    expect(tokensCss).toContain('@keyframes pixel-layer-enter')
    expect(tokensCss).toContain('@keyframes pixel-surface-release')
    expect(tokensCss).toContain('@keyframes pixel-sheet-enter-right')
    expect(tokensCss).toContain('@keyframes pixel-float-enter')
    expect(tokensCss).toContain("[data-slot='dialog-content'][data-state='open']")
    expect(tokensCss).toContain("[data-slot='sheet-content'][data-side='right'][data-state='open']")
    expect(tokensCss).toContain("[data-slot='select-content'][data-state='open']")
  })

  it('reveals CRUD layers through the real PixelWave circuit surface', () => {
    expect(pixelSurfaceReveal).toContain('<PixelWave')
    expect(pixelSurfaceReveal).toContain('appearance="circuit"')
    expect(pixelSurfaceReveal).toContain('waveSpeed={6}')
    for (const component of layerComponents) {
      expect(component).toContain('<PixelSurfaceReveal')
    }
    expect(tokensCss).not.toContain('@keyframes pixel-wave-reveal')
    expect(tokensCss).not.toContain('@keyframes pixel-wave-front')
    expect(tokensCss).not.toContain('@keyframes pixel-frame-assemble')
    expect(tokensCss).toContain("html[data-motion='off'] *::before")
    expect(tokensCss).toContain("html[data-motion='off'] *::after")
  })
})
