import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const selected = vi.hoisted(() => ({ theme: 'system', density: 'comfortable', language: 'zh' }))

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
    expect(html).not.toContain('tabindex="-1"')
  })

  it('keeps the announced selection in sync with controlled settings', () => {
    selected.theme = 'dark'
    selected.density = 'compact'
    selected.language = 'en'
    expect(pressedLabels(render())).toEqual(['深色', '紧凑', 'English'])
  })
})
