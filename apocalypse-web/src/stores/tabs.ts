/**
 * 多页签状态：打开/关闭/激活，以及各页签的 URL 查询串快照（searchByKey）。
 * key 用路由 path（同路径复用同一页签）。仅运行时状态，不持久化。
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
  /** 各页签最近一次的查询参数快照（如 "?page=2&keyword=admin"），切页签时不断流。 */
  searchByKey: Record<string, string>
  open: (tab: TabItem, search?: string) => void
  setTabSearch: (key: string, search: string) => void
  getTabSearch: (key: string) => string
  targetHref: (key: string) => string
  close: (key: string) => string | null
  closeOthers: (key: string) => void
  closeLeft: (key: string) => void
  closeRight: (key: string) => void
  closeAll: () => void
  activate: (key: string) => void
  retainAllowed: (allowedKeys: string[]) => void
  reset: () => void
}

export const DASHBOARD_TAB: TabItem = { key: '/dashboard', title: '工作台' }

export function isPinnedTab(key: string) {
  return key === DASHBOARD_TAB.key
}

/**
 * 认证区根路径会立即重定向到工作台；在重定向前 AppLayout 也可能先同步一次 location。
 * 统一规范化路由 key，避免 `/` / `/dashboard/` 被当成额外页签。
 */
export function normalizeTabKey(key: string) {
  if (key === '/' || key === '/dashboard/') return DASHBOARD_TAB.key
  return key.length > 1 ? key.replace(/\/+$/, '') : key
}

function normalizeSearch(search: string | undefined): string {
  if (!search || search === '?') return ''
  return search.startsWith('?') ? search : `?${search}`
}

function retainSearchMap(
  searchByKey: Record<string, string>,
  keptTabs: readonly TabItem[],
): Record<string, string> {
  const allowed = new Set(keptTabs.map((item) => item.key))
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(searchByKey)) {
    if (allowed.has(key) && value) next[key] = value
  }
  return next
}

function normalizeTabs(tabs: TabItem[]) {
  const unique = new Map<string, TabItem>()
  for (const tab of tabs) {
    const key = normalizeTabKey(tab.key)
    if (!unique.has(key)) unique.set(key, isPinnedTab(key) ? DASHBOARD_TAB : { ...tab, key })
  }
  const dashboard = unique.get(DASHBOARD_TAB.key)
  const others = [...unique.values()].filter((item) => !isPinnedTab(item.key))
  return dashboard ? [dashboard, ...others] : others
}

function ensureDashboard(tabs: TabItem[]) {
  return tabs.some((item) => isPinnedTab(item.key)) ? tabs : [DASHBOARD_TAB, ...tabs]
}

export const useTabsStore = create<TabsState>()((set, get) => ({
  tabs: [],
  activeKey: null,
  searchByKey: {},

  open(tab, search) {
    const key = normalizeTabKey(tab.key)
    const normalizedTab = isPinnedTab(key) ? DASHBOARD_TAB : { ...tab, key }
    const tabs = normalizeTabs(get().tabs)
    const tabsWithDashboard = isPinnedTab(key) ? tabs : ensureDashboard(tabs)
    const nextTabs = tabsWithDashboard.some((item) => item.key === key)
      ? tabsWithDashboard
      : [...tabsWithDashboard, normalizedTab]
    const nextSearchMap = { ...get().searchByKey }
    if (search !== undefined) {
      const normalized = normalizeSearch(search)
      if (normalized) nextSearchMap[key] = normalized
      else delete nextSearchMap[key]
    }
    set({
      tabs: nextTabs,
      activeKey: key,
      searchByKey: retainSearchMap(nextSearchMap, nextTabs),
    })
  },

  setTabSearch(key, search) {
    const normalizedKey = normalizeTabKey(key)
    const normalizedSearch = normalizeSearch(search)
    const current = get().searchByKey[normalizedKey] ?? ''
    if (current === normalizedSearch) return
    const nextSearchMap = { ...get().searchByKey }
    if (normalizedSearch) nextSearchMap[normalizedKey] = normalizedSearch
    else delete nextSearchMap[normalizedKey]
    set({ searchByKey: nextSearchMap })
  },

  getTabSearch(key) {
    return get().searchByKey[normalizeTabKey(key)] ?? ''
  },

  targetHref(key) {
    const normalizedKey = normalizeTabKey(key)
    const search = get().searchByKey[normalizedKey] ?? ''
    return search ? `${normalizedKey}${search}` : normalizedKey
  },

  /** 关闭页签；当前页签关闭后统一回工作台，非当前页签不触发跳转。 */
  close(key) {
    if (isPinnedTab(key)) return null
    const { tabs, activeKey, searchByKey } = get()
    const next = tabs.filter((item) => item.key !== key)
    if (activeKey !== key) {
      set({ tabs: next, searchByKey: retainSearchMap(searchByKey, next) })
      return null
    }
    const kept = ensureDashboard(next)
    set({
      tabs: kept,
      activeKey: DASHBOARD_TAB.key,
      searchByKey: retainSearchMap(searchByKey, kept),
    })
    return DASHBOARD_TAB.key
  },

  closeOthers(key) {
    if (!get().tabs.some((item) => item.key === key)) return
    const kept = ensureDashboard(
      get().tabs.filter((item) => isPinnedTab(item.key) || item.key === key),
    )
    set({
      tabs: kept,
      activeKey: key,
      searchByKey: retainSearchMap(get().searchByKey, kept),
    })
  },

  closeLeft(key) {
    const { tabs, searchByKey } = get()
    const index = tabs.findIndex((item) => item.key === key)
    if (index < 0) return
    const kept = ensureDashboard(
      tabs.filter((item, itemIndex) => isPinnedTab(item.key) || itemIndex >= index),
    )
    set({ tabs: kept, searchByKey: retainSearchMap(searchByKey, kept) })
  },

  closeRight(key) {
    const { tabs, searchByKey } = get()
    const index = tabs.findIndex((item) => item.key === key)
    if (index < 0) return
    const kept = ensureDashboard(
      tabs.filter((item, itemIndex) => isPinnedTab(item.key) || itemIndex <= index),
    )
    set({ tabs: kept, searchByKey: retainSearchMap(searchByKey, kept) })
  },

  closeAll() {
    const dashboard = get().tabs.find((item) => isPinnedTab(item.key)) ?? DASHBOARD_TAB
    const kept = [dashboard]
    set({
      tabs: kept,
      activeKey: dashboard.key,
      searchByKey: retainSearchMap(get().searchByKey, kept),
    })
  },

  activate(key) {
    set({ activeKey: normalizeTabKey(key) })
  },

  retainAllowed(allowedKeys) {
    const allowed = new Set(allowedKeys.map(normalizeTabKey))
    allowed.add(DASHBOARD_TAB.key)
    const tabs = ensureDashboard(get().tabs.filter((item) => allowed.has(item.key)))
    const activeKey = get().activeKey
    set({
      tabs,
      activeKey: activeKey && allowed.has(activeKey) ? activeKey : DASHBOARD_TAB.key,
      searchByKey: retainSearchMap(get().searchByKey, tabs),
    })
  },

  reset() {
    set({ tabs: [], activeKey: null, searchByKey: {} })
  },
}))
