/**
 * 界面设置：主题 / accent / 密度 / 布局变体 / 多页签 / 内容宽度 / 固定顶栏 /
 * 灰度模式 / 动画 / 语言 / 吉祥物皮肤。
 *
 * 核心设计 ——「产品设置 + 开发态能力实验室」：
 * CAPABILITY_META 登记全部能力项及其默认 exposed；exposed=false 的能力
 * 不在设置面板渲染、也不生效（getter 回退默认值）。非开发构建只允许主题、密度、
 * 语言读取用户值；其它能力固定使用产品默认值。
 * 下游项目裁剪方式：把对应 CAPABILITY_META 项的 exposed 改为 false（或删除该项），
 * 面板与逻辑自动收敛，无需改任何组件代码。
 *
 * DOM 生效点在 app/providers.tsx（dark class / data-accent / data-density /
 * data-gray / data-motion）。
 *
 * 皮肤 ↔ 品牌主色：v4↔periwinkle、v3↔mint（DEFINITION.md §2）。setMascotSkin
 * 必写对应 accent；setAccent(mint|periwinkle) 必写对应皮肤。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { SkinId } from '@/effects/PixelOrb/types'

/**
 * accent 预设（色板定义在 design/tokens.css 的 [data-accent] 组）。
 * mint 为像素蝾螈品牌默认（v3）；periwinkle 与 v4 皮肤联动。见 DEFINITION.md §2。
 */
export const ACCENTS = [
  'periwinkle',
  'mint',
  'violet',
  'blue',
  'green',
  'orange',
  'rose',
  'cyan',
  'mono',
] as const
export type Accent = (typeof ACCENTS)[number]

/** 皮肤 → 品牌 accent。切皮肤必切这一对。 */
export const SKIN_ACCENT = { v3: 'mint', v4: 'periwinkle' } as const satisfies Record<
  SkinId,
  Accent
>

/** 品牌 accent → 皮肤。其它 accent 不在此表，切它们不改皮肤。 */
export const ACCENT_SKIN: Partial<Record<Accent, SkinId>> = {
  mint: 'v3',
  periwinkle: 'v4',
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'compact' | 'comfortable'
export type LayoutVariant = 'sidebar' | 'topbar' | 'mixed'
/** 内容宽度：fluid=通栏，boxed=限宽居中。 */
export type ContentWidth = 'fluid' | 'boxed'
export type Language = 'zh' | 'en'

/** 能力项 key 全集。 */
export type CapabilityKey =
  | 'theme'
  | 'accent'
  | 'density'
  | 'layout'
  | 'tabs'
  | 'contentWidth'
  | 'fixedHeader'
  | 'grayMode'
  | 'motion'
  | 'mascot'
  | 'language'

interface CapabilityMeta {
  key: CapabilityKey
  label: string
  /** 下游裁剪开关：false 时设置面板不渲染该能力，读取回退默认值。 */
  exposed: boolean
}

export const CAPABILITY_META: CapabilityMeta[] = [
  { key: 'theme', label: '主题', exposed: true },
  { key: 'accent', label: '强调色', exposed: true },
  { key: 'density', label: '密度', exposed: true },
  { key: 'layout', label: '布局', exposed: true },
  { key: 'tabs', label: '多页签', exposed: true },
  { key: 'contentWidth', label: '内容宽度', exposed: true },
  { key: 'fixedHeader', label: '固定顶栏', exposed: true },
  { key: 'grayMode', label: '灰色模式', exposed: true },
  { key: 'motion', label: '动画', exposed: true },
  { key: 'mascot', label: '吉祥物', exposed: true },
  { key: 'language', label: '语言', exposed: true },
]

export function isCapabilityExposed(key: CapabilityKey): boolean {
  return CAPABILITY_META.find((item) => item.key === key)?.exposed ?? false
}

interface SettingsState {
  theme: ThemeMode
  accent: Accent
  density: Density
  layout: LayoutVariant
  tabsEnabled: boolean
  contentWidth: ContentWidth
  fixedHeader: boolean
  grayMode: boolean
  motionEnabled: boolean
  mascotSkin: SkinId
  language: Language

  setTheme: (theme: ThemeMode) => void
  setAccent: (accent: Accent) => void
  setDensity: (density: Density) => void
  setLayout: (layout: LayoutVariant) => void
  setTabsEnabled: (enabled: boolean) => void
  setContentWidth: (width: ContentWidth) => void
  setFixedHeader: (fixed: boolean) => void
  setGrayMode: (enabled: boolean) => void
  setMotionEnabled: (enabled: boolean) => void
  setMascotSkin: (mascotSkin: SkinId) => void
  setLanguage: (language: Language) => void
}

export const DEFAULT_SETTINGS = {
  theme: 'system' as ThemeMode,
  accent: 'mint' as Accent,
  density: 'comfortable' as Density,
  layout: 'sidebar' as LayoutVariant,
  tabsEnabled: true,
  contentWidth: 'fluid' as ContentWidth,
  fixedHeader: true,
  grayMode: false,
  motionEnabled: true,
  mascotSkin: 'v3' as SkinId,
  language: 'zh' as Language,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => {
        const mascotSkin = ACCENT_SKIN[accent]
        set(mascotSkin ? { accent, mascotSkin } : { accent })
      },
      setDensity: (density) => set({ density }),
      setLayout: (layout) => set({ layout }),
      setTabsEnabled: (tabsEnabled) => set({ tabsEnabled }),
      setContentWidth: (contentWidth) => set({ contentWidth }),
      setFixedHeader: (fixedHeader) => set({ fixedHeader }),
      setGrayMode: (grayMode) => set({ grayMode }),
      setMotionEnabled: (motionEnabled) => set({ motionEnabled }),
      setMascotSkin: (mascotSkin) => set({ mascotSkin, accent: SKIN_ACCENT[mascotSkin] }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'apocalypse.settings',
      version: 4,
      // v2：默认皮肤 v3 → v4
      // v3：v4 默认 accent mint（历史分裂）→ periwinkle，与皮肤对齐（DEFINITION §2）
      // v4：品牌主形象改为薄荷色像素蝾螈，默认重置为 v3 + mint。
      migrate: (persisted, version) => {
        if (!(persisted && typeof persisted === 'object')) {
          return persisted as SettingsState
        }
        const state = persisted as SettingsState
        if (version < 2 && state.mascotSkin === 'v3') state.mascotSkin = 'v4'
        if (version < 3 && state.mascotSkin === 'v4' && state.accent === 'mint') {
          state.accent = 'periwinkle'
        }
        if (version < 4) {
          state.mascotSkin = 'v3'
          state.accent = 'mint'
        }
        return state
      },
    },
  ),
)

/** 读取设置（尊重 exposed 裁剪：未暴露能力恒返回默认值）。 */
export function useSettings() {
  const state = useSettingsStore()
  const labEnabled = import.meta.env.DEV
  return {
    theme: isCapabilityExposed('theme') ? state.theme : DEFAULT_SETTINGS.theme,
    accent: labEnabled && isCapabilityExposed('accent') ? state.accent : DEFAULT_SETTINGS.accent,
    density: isCapabilityExposed('density') ? state.density : DEFAULT_SETTINGS.density,
    layout: labEnabled && isCapabilityExposed('layout') ? state.layout : DEFAULT_SETTINGS.layout,
    tabsEnabled:
      labEnabled && isCapabilityExposed('tabs') ? state.tabsEnabled : DEFAULT_SETTINGS.tabsEnabled,
    contentWidth:
      labEnabled && isCapabilityExposed('contentWidth')
        ? state.contentWidth
        : DEFAULT_SETTINGS.contentWidth,
    fixedHeader:
      labEnabled && isCapabilityExposed('fixedHeader')
        ? state.fixedHeader
        : DEFAULT_SETTINGS.fixedHeader,
    grayMode:
      labEnabled && isCapabilityExposed('grayMode') ? state.grayMode : DEFAULT_SETTINGS.grayMode,
    motionEnabled:
      labEnabled && isCapabilityExposed('motion')
        ? state.motionEnabled
        : DEFAULT_SETTINGS.motionEnabled,
    mascotSkin:
      labEnabled && isCapabilityExposed('mascot') ? state.mascotSkin : DEFAULT_SETTINGS.mascotSkin,
    language: isCapabilityExposed('language') ? state.language : DEFAULT_SETTINGS.language,
  }
}
