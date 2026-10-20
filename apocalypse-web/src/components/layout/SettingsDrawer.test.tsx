import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const selected = vi.hoisted(() => ({
  theme: 'system',
  density: 'comfortable',
  language: 'zh',
  motionEnabled: true,
}))

vi.mock('@/stores/settings', async (original) => {
  const settings = await original<typeof import('@/stores/settings')>()
  return { ...settings, useSettings: () => ({ ...settings.DEFAULT_SETTINGS, ...selected }) }
})
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}))
vi.mock('@/components/MotionCollapse', () => ({ MotionCollapse: () => null }))

import { SettingsDrawer } from './SettingsDrawer'
import { CAPABILITY_META } from '@/stores/settings'

const motionCapability = CAPABILITY_META.find(({ key }) => key === 'motion')!
const originalMotionExposure = motionCapability.exposed

const render = () => renderToStaticMarkup(<SettingsDrawer open onOpenChange={vi.fn()} />)
const pressedLabels = (html: string) =>
  Array.from(
    html.matchAll(/<button[^>]*aria-pressed="true"[^>]*>([^<]+)<\/button>/g),
    (match) => match[1],
  )

beforeEach(() => {
  selected.theme = 'system'
  selected.density = 'comfortable'
  selected.language = 'zh'
  selected.motionEnabled = true
  vi.stubEnv('DEV', false)
})

afterEach(() => {
  motionCapability.exposed = originalMotionExposure
  vi.unstubAllEnvs()
})

describe('settings option semantics', () => {
  it('names each setting group and exposes exactly the active choices on native buttons', () => {
    const html = render()
    const groups = Array.from(
      html.matchAll(/role="group" aria-labelledby="([^"]+)"/g),
      (match) => match[1],
    )
    expect(groups).toHaveLength(3)
    expect(new Set(groups).size).toBe(3)
    for (const [index, name] of ['主题', '密度', '语言'].entries()) {
      expect(html).toContain(`id="${groups[index]}"`)
      expect(html).toContain(`>${name}</label>`)
    }
    expect(pressedLabels(html)).toEqual(['跟随系统', '舒适', '中文'])
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(4)
    expect(html.match(/type="button" aria-pressed=/g)).toHaveLength(7)
    expect(html).not.toMatch(/<button[^>]*tabindex="-1"/)
  })

  it('keeps the announced selection in sync with controlled settings', () => {
    selected.theme = 'dark'
    selected.density = 'compact'
    selected.language = 'en'
    expect(pressedLabels(render())).toEqual(['深色', '紧凑', 'English'])
  })

  it.each([false, true])('exposes a named motion preference outside the lab when DEV=%s', (dev) => {
    vi.stubEnv('DEV', dev)
    const html = render()
    const switches = html.match(/<button[^>]*role="switch"[^>]*>/g) ?? []
    expect(switches).toHaveLength(1)
    const motionSwitch = switches[0]!
    const id = motionSwitch.match(/ id="([^"]+)"/)?.[1]
    const descriptionId = motionSwitch.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    expect(descriptionId).toBeTruthy()
    expect(html).toContain(`for="${id}"`)
    expect(html).toContain('>界面动画</label>')
    expect(html).toContain(`id="${descriptionId}"`)
    expect(html).toContain('始终遵循系统的减少动态效果设置')
    expect(motionSwitch).toContain('aria-checked="true"')
  })

  it('announces the current disabled preference and hides a trimmed motion capability', () => {
    selected.motionEnabled = false
    expect(render()).toContain('aria-checked="false"')
    motionCapability.exposed = false
    const html = render()
    expect(html).not.toContain('role="switch"')
    expect(html).not.toContain('>界面动画</label>')
  })
})
