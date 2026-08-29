/**
 * 多页签状态：打开/关闭/激活。key 用路由 path（同路径复用同一页签）。
 * 仅运行时状态，不持久化。
 *
 * title 约定：存**菜单原文**（未翻译），渲染层（TabBar）经 useMenuTitle 实时
 * 翻译 —— 切语言时页签自动跟随，不存翻译快照（历史 bug：快照导致页签不随语言变）。
 */

import { create } from 'zustand'

export interface TabItem {
  /** 路由 path（唯一键）。 */
  key: string
  /** 菜单原文（渲染层负责翻译）。 */
  title: string
}

interface TabsState {
  tabs: TabItem[]
  activeKey: string | null
  open: (tab: TabItem) => void
  close: (key: string) => string | null
  closeOthers: (key: string) => void
  activate: (key: string) => void
  reset: () => void
}

export const useTabsStore = create<TabsState>()((set, get) => ({
  tabs: [],
  activeKey: null,

  open(tab) {
    const { tabs } = get()
    if (!tabs.some((item) => item.key === tab.key)) {
      set({ tabs: [...tabs, tab], activeKey: tab.key })
    } else {
      set({ activeKey: tab.key })
    }
  },

  /** 关闭页签，返回需要跳转的相邻页签 key（无则 null）。 */
  close(key) {
    const { tabs, activeKey } = get()
    const index = tabs.findIndex((item) => item.key === key)
    const next = tabs.filter((item) => item.key !== key)
    set({ tabs: next })
    if (activeKey !== key) return null
    const neighbor = next[Math.min(index, next.length - 1)]
    set({ activeKey: neighbor?.key ?? null })
    return neighbor?.key ?? null
  },

  closeOthers(key) {
    const kept = get().tabs.filter((item) => item.key === key)
    set({ tabs: kept, activeKey: key })
  },

  activate(key) {
    set({ activeKey: key })
  },

  reset() {
    set({ tabs: [], activeKey: null })
  },
}))
