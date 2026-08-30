/**
 * 菜单 component 字符串 → 页面组件映射。
 *
 * 解析顺序：
 * 1. 显式映射表（需要特殊接线/懒加载控制的页面登记在此）；
 * 2. 约定兜底：component='system/user/index' → src/views/system/user/index.tsx，
 *    component='system/user' → src/views/system/user/index.tsx（import.meta.glob 静态分析）。
 *
 * DynaLayer（schema 驱动）已落地；标准 CRUD 页面仍由薄页面组件承载 schema 并在此登记，
 * 由 schema 渲染器接管；本映射表仅保留越出标准模式的页面。
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

type PageComponent = ComponentType | LazyExoticComponent<ComponentType>

const DashboardPage = lazy(() => import('@/views/dashboard'))
const UserPage = lazy(() => import('@/views/system/user'))

/** 显式映射表：key 为后端 menus.component 字符串。 */
const EXPLICIT_MAP: Record<string, PageComponent> = {
  dashboard: DashboardPage,
  'dashboard/index': DashboardPage,
  'system/user': UserPage,
  'system/user/index': UserPage,
}

/** 约定兜底：views 目录全量 glob（懒加载 chunk）。 */
const PAGE_GLOBS = import.meta.glob<{ default: ComponentType }>('../views/**/index.tsx')

function resolveByConvention(component: string): PageComponent | null {
  const normalized = component.replace(/^\/+|\/+$/g, '')
  const candidates = [
    `../views/${normalized}/index.tsx`,
    `../views/${normalized.replace(/\/index$/, '')}/index.tsx`,
  ]
  for (const key of candidates) {
    const loader = PAGE_GLOBS[key]
    if (loader) return lazy(loader)
  }
  return null
}

/** 解析 component 字符串；未命中返回 null（路由层落 404 占位）。 */
export function resolvePageComponent(component: string | null): PageComponent | null {
  if (!component) return null
  const normalized = component.replace(/^\/+|\/+$/g, '')
  return EXPLICIT_MAP[normalized] ?? resolveByConvention(normalized)
}
