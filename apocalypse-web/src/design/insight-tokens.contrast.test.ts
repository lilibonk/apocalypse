import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * A-ENV-2: contrast guard for the tokens added by the 2026-10-18 video adaptation. Opaque oklch
 * tokens are converted to sRGB relative luminance (WCAG 2.x); translucent tokens are excluded.
 */
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

function declarations(selector: ':root' | '.dark'): Map<string, string> {
  const values = new Map<string, string>()
  const block = /([^{}]+)\{([^{}]*)\}/g
  for (const [, head, body] of css.matchAll(block)) {
    if (head.trim() !== selector) continue
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
      values.set(name, value.trim())
  }
  return values
}

function luminance(value: string): number {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value)
  if (!match) throw new Error(`Not an opaque oklch token: ${value}`)
  const [L, C, h] = match.slice(1).map(Number)
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel))
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}

function ratio(first: string, second: string) {
  const [high, low] = [luminance(first), luminance(second)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

describe.each([':root', '.dark'] as const)('insight tokens in %s', (selector) => {
  const own = declarations(selector)
  const base = declarations(':root')
  const token = (name: string) => {
    const value = own.get(name) ?? base.get(name)
    if (!value) throw new Error(`Missing ${name}`)
    return value
  }

  it('keeps the path highlight at least 3:1 against cards (WCAG 1.4.11)', () => {
    expect(ratio(token('--insight-path'), token('--card'))).toBeGreaterThanOrEqual(3)
  })

  it('orders the heat ramp monotonically away from the card and ends at 3:1 or more', () => {
    const card = token('--card')
    const steps = [0, 1, 2, 3, 4].map((level) => ratio(token(`--heat-${level}`), card))
    for (let level = 1; level < steps.length; level++)
      expect(steps[level]).toBeGreaterThan(steps[level - 1])
    expect(steps[4]).toBeGreaterThanOrEqual(3)
  })

  it('keeps adjacent heat levels visibly distinct', () => {
    for (let level = 1; level <= 4; level++)
      expect(ratio(token(`--heat-${level}`), token(`--heat-${level - 1}`))).toBeGreaterThanOrEqual(
        1.2,
      )
  })

  it('separates uncovered cells from the empty level', () => {
    expect(ratio(token('--heat-uncovered'), token('--heat-uncovered-stripe'))).toBeGreaterThan(1.2)
  })

  it('keeps draft bar text readable (WCAG 1.4.3)', () => {
    expect(ratio(token('--draft-bar-foreground'), token('--draft-bar'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('--draft-bar-muted'), token('--draft-bar'))).toBeGreaterThanOrEqual(4.5)
  })
})
