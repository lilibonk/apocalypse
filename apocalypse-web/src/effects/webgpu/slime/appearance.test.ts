import { readFileSync } from 'node:fs'

import { Color, Texture, type Renderer } from 'three/webgpu'
import { afterEach, describe, expect, it, vi } from 'vitest'

const targets = vi.hoisted(() => ({ disposals: [] as ReturnType<typeof vi.fn>[] }))
vi.mock('three/webgpu', async (original) => {
  const actual = await original<typeof import('three/webgpu')>()
  return {
    ...actual,
    PMREMGenerator: class {
      fromScene() {
        const dispose = vi.fn()
        targets.disposals.push(dispose)
        return { texture: new actual.Texture(), dispose }
      }
      dispose = vi.fn()
    },
  }
})

import { createSlimeScene } from './scene'
import { readSlimeColours } from './appearance'

const designTokens = readFileSync(new URL('../../../design/tokens.css', import.meta.url), 'utf8')
function themeColours(theme: ':root' | '.dark') {
  const block = designTokens.split(`${theme} {`)[1]?.split('}')[0] ?? ''
  const tokens = new Map(
    [...block.matchAll(/(--slime-[\w-]+):\s*(#[\da-f]{6});/gi)].map(([, name, value]) => [
      name,
      value,
    ]),
  )
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => tokens.get(name) ?? '',
  }))
  return readSlimeColours({} as Element)
}

// Token-level luminance guard, not a claim about WCAG contrast in a translucent render.
function contrast(first: Color, second: Color) {
  const luminance = ({ r, g, b }: Color) => r * 0.2126 + g * 0.7152 + b * 0.0722
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

afterEach(() => {
  vi.unstubAllGlobals()
  targets.disposals = []
})

describe('人工验收回归：完整主题材质与透明合成', () => {
  it('奶白薄荷与腮红明暗同源，深色五官保持可辨', () => {
    const light = themeColours(':root')
    const dark = themeColours('.dark')
    expect(light.body.getHexString()).toBe('a9c5ad')
    expect(light.cream.getHexString()).toBe('f9f5dd')
    expect(light.blush.getHexString()).toBe('edaa94')
    expect(light.skinTint.getHexString()).toBe('fffdf0')
    expect(light.face.getHexString()).toBe('4d2d1b')
    expect(light.glow.getHexString()).toBe('176b53')
    expect(dark.body.getHexString()).toBe('a1c6b3')
    expect(dark.skinTint.getHexString()).toBe('e3e8df')
    expect(dark.cream.equals(light.cream)).toBe(false)
    expect(dark.blush.equals(light.blush)).toBe(false)
    expect(dark.skinTint.equals(light.skinTint)).toBe(false)
    expect(dark.glow.getHexString()).toBe('39b889')
    expect(contrast(dark.body, dark.face)).toBeGreaterThan(8)
    expect(contrast(dark.skinTint, dark.stage)).toBeGreaterThan(10)
    expect(contrast(dark.glow, dark.stage)).toBeGreaterThan(6)
    expect(dark.body.equals(light.body)).toBe(false)
  })

  it('热切换会更新身体/衰减、释放旧环境；气泡为体内透明非金属', () => {
    const light = themeColours(':root')
    const renderer = { setClearColor: vi.fn() } as unknown as Renderer
    const view = createSlimeScene(renderer, light)
    expect(view.scene.background).toBeNull()
    expect(renderer.setClearColor).toHaveBeenCalledWith(0, 0)
    const initialEnvironment = view.scene.environment
    expect(view.bubbles.count).toBe(116)
    expect(
      view.bubbleSeeds.some((seed) => Math.abs(seed.x) < 0.3 && seed.y > 0.8 && seed.y < 1.4),
    ).toBe(true)
    expect(view.bubbles.material.transparent).toBe(true)
    expect(view.bubbles.material.isMeshBasicNodeMaterial).toBe(true)
    expect(view.bubbles.material.depthWrite).toBe(false)
    for (const seed of view.bubbleSeeds) expect(seed.size).toBeLessThanOrEqual(0.042)
    const dark = themeColours('.dark')
    view.updateColours(dark)
    expect(view.body.material.color.equals(dark.body)).toBe(true)
    expect(view.body.material.attenuationColor.equals(dark.attenuation)).toBe(true)
    expect(view.bubbles.material.color.equals(dark.body.clone().lerp(dark.light, 0.65))).toBe(true)
    expect(view.scene.environment).toBeInstanceOf(Texture)
    expect(view.scene.environment).not.toBe(initialEnvironment)
    expect(targets.disposals[0]).toHaveBeenCalledOnce()
    view.updateColours(light)
    expect(view.body.material.color.equals(light.body)).toBe(true)
    expect(view.body.material.attenuationColor.equals(light.attenuation)).toBe(true)
    expect(targets.disposals[1]).toHaveBeenCalledOnce()
    view.dispose()
    expect(targets.disposals[2]).toHaveBeenCalledOnce()
  })
})
