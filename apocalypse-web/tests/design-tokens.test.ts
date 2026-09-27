import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/design/tokens.css', import.meta.url), 'utf8')

function declarations(selector: string) {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`Missing theme ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    Array.from(body.matchAll(/(--[\w-]+):\s*([^;]+);/g), (match) => [match[1], match[2]]),
  )
}

/** WCAG luminance from opaque, sRGB-gamut-clipped OKLCH semantic tokens. */
function luminance(value: string) {
  const parts = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value)
  if (!parts) throw new Error(`Expected an opaque OKLCH token, got ${value}`)
  const [, rawLightness, rawChroma, rawHue] = parts
  const lightness = Number(rawLightness)
  const hue = (Number(rawHue) * Math.PI) / 180
  const a = Number(rawChroma) * Math.cos(hue)
  const b = Number(rawChroma) * Math.sin(hue)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (channel: number) => Math.max(0, Math.min(1, channel))
  const red = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const green = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
  return (values[1] + 0.05) / (values[0] + 0.05)
}

const themes = [':root', '.dark'] as const

describe('readable semantic themes', () => {
  it.each(themes)(
    '%s keeps readable brand emphasis and status pairs in the small-text range',
    (theme) => {
      const tokens = declarations(theme)
      const pairs = [
        ['--foreground', '--background'],
        ['--card-foreground', '--card'],
        ['--popover-foreground', '--popover'],
        ['--secondary-foreground', '--secondary'],
        ['--accent-foreground', '--accent'],
        ['--brand-foreground', '--brand'],
        ['--destructive-foreground', '--destructive'],
        ['--success-foreground', '--success'],
        ['--warning-foreground', '--warning'],
        ['--info-foreground', '--info'],
      ]
      for (const surface of ['--background', '--card', '--popover', '--surface-navigation']) {
        pairs.push(['--muted-foreground', surface], ['--brand-text', surface])
      }
      for (const [text, surface] of pairs) {
        expect(
          contrast(tokens[text], tokens[surface]),
          `${theme}: ${text} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
      expect(tokens['--ring']).toBe('var(--brand-text)')
    },
  )

  it.each(themes)(
    '%s keeps experiment accent text readable without changing fixed role colors',
    (theme) => {
      const base = declarations(theme)
      for (const accent of [
        'mint',
        'periwinkle',
        'violet',
        'blue',
        'green',
        'orange',
        'rose',
        'cyan',
        'mono',
      ]) {
        const override = declarations(`${theme}[data-accent='${accent}']`)
        expect(
          contrast(override['--brand-text'], base['--background']),
          `${theme}: ${accent}`,
        ).toBeGreaterThanOrEqual(4.5)
        for (const semantic of ['--success', '--warning', '--info'])
          expect(override).not.toHaveProperty(semantic)
      }
    },
  )

  it('changes spacing alone for density, keeping body text legible', () => {
    expect(css).toContain('font-size: 16px')
    for (const density of ['compact', 'comfortable']) {
      const selector = `html[data-density='${density}']`
      const start = css.indexOf(`${selector} {`)
      const body = css.slice(start, css.indexOf('}', start))
      expect(body).toContain('--spacing:')
      expect(body).not.toContain('font-size:')
    }
  })

  it('starts navigation with an opaque surface and supplies transparency/contrast fallbacks', () => {
    for (const theme of themes) {
      expect(declarations(theme)['--surface-navigation']).not.toContain('/')
      expect(declarations(theme)['--surface-navigation-glass']).toContain('/')
    }
    expect(css).toContain(
      '@supports (backdrop-filter: blur(0)) or (-webkit-backdrop-filter: blur(0))',
    )
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)')
    expect(css).toContain('@media (forced-colors: active)')
    expect(css).toContain('background: Canvas')
  })
})
