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
  it('真实暗色 token 保持翡翠明度与深色五官，亮色配方不变', () => {
    const light = themeColours(':root')
    const dark = themeColours('.dark')
    expect(light.body.getHexString()).toBe('93dbc4')
    expect(light.glow.getHexString()).toBe('176b53')
    expect(dark.body.getHexString()).toBe('91efd0')
    expect(dark.glow.getHexString()).toBe('39b889')
    expect(contrast(dark.body, dark.face)).toBeGreaterThan(10)
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
    expect(view.bubbles).toHaveLength(56)
    expect(view.bubbles.some(({ rest }) => rest.z < 0)).toBe(true)
    expect(
      view.bubbles.some(({ rest }) => Math.abs(rest.x) < 0.6 && rest.y > 0.72 && rest.y < 1.12),
    ).toBe(true)
    for (const bubble of view.bubbles) {
      expect(bubble.material.transparent).toBe(true)
      expect(bubble.material.metalness).toBe(0)
      expect(bubble.radius).toBeLessThan(0.034)
      expect(bubble.mesh.renderOrder).toBeLessThan(view.body.renderOrder)
    }
    const dark = themeColours('.dark')
    view.updateColours(dark)
    expect(view.body.material.color.equals(dark.body)).toBe(true)
    expect(view.body.material.attenuationColor.equals(dark.attenuation)).toBe(true)
    for (const bubble of view.bubbles) expect(bubble.material.color.equals(dark.light)).toBe(true)
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
