/**
 * menus 树 → 动态路由。
 *
 * 规则：
 * - M（菜单）且有 path：生成路由；component 经 component-map 解析，未命中落 NotFound 占位。
 * - C（目录）：仅展平收集子树的 M 路由，自身不产生路由。
 * - F（按钮）：不产生路由（权限经 Perm 使用）。
 * - 同时产出 path → 标题映射，供多页签/面包屑使用。
 */

import { useMemo } from 'react'
import { Route } from 'react-router'
import { Suspense, createElement, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { PageLoading } from '@/components/PageLoading'
import { useMenuTitle } from '@/hooks/useMenuTitle'
import { resolvePageComponent } from '@/routes/component-map'
import type { MenuNode } from '@/lib/api/types'
import { useAuthStore } from '@/stores/auth'

export interface FlatRoute {
  /** 规范化后的绝对 path（如 /system/user）。 */
  path: string
  title: string
  component: string | null
  icon: string | null
  moduleKey: string | null
}

/**
 * 后端菜单既可能给相对段（user），也可能给应用根路径（system/user）。
 * 含多级段的配置按根路径解析，避免目录再次拼接出 /system/system/user。
 */
export function resolveMenuPath(rawPath: string | null, parentPath: string): string {
  const segment = rawPath?.replace(/^\/+|\/+$/g, '') ?? ''
  if (!segment) return parentPath || '/'
  if (rawPath?.startsWith('/') || segment.includes('/')) return `/${segment}`
  return parentPath ? `${parentPath}/${segment}` : `/${segment}`
}

export function flattenMenuRoutes(menus: MenuNode[]): FlatRoute[] {
  const routes: FlatRoute[] = []

  const walk = (nodes: MenuNode[], parentPath: string, parentModule: string | null) => {
    for (const node of [...nodes].sort((a, b) => a.sort - b.sort)) {
      if (node.menuType === 'F') continue
      const fullPath = resolveMenuPath(node.path, parentPath)
      const moduleKey = node.moduleKey || parentModule
      if (node.menuType === 'M' && node.path) {
        routes.push({
          path: fullPath,
          title: node.menuName,
          component: node.component,
          icon: node.icon,
          moduleKey,
        })
      }
      if (node.children.length > 0) walk(node.children, fullPath, moduleKey)
    }
  }

  walk(menus, '', null)
  return routes
}

function RouteLoading() {
  return <PageLoading />
}

/** Missing chunks are terminal, not a loading state; never render a server-supplied URL. */
function RouteNotFound({ title }: { title: string }) {
  const menuTitle = useMenuTitle()
  const { t } = useTranslation()
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{menuTitle(title)}</h1>
        <p role="status" className="mt-0.5 text-sm text-muted-foreground">
          {t('route.notInstalled')}
        </p>
      </div>
    </div>
  )
}

/** 当前用户菜单 → <Route> 列表 + 首页重定向。 */
export function useMenuRoutes(): { routeElements: ReactElement[]; indexPath: string } {
  const menus = useAuthStore((state) => state.menus)

  return useMemo(() => {
    const flat = flattenMenuRoutes(menus)
    const routeElements = flat.map((route) => {
      const Component = resolvePageComponent(route.component, route.moduleKey)
      return createElement(Route, {
        key: route.path,
        path: route.path.replace(/^\//, ''),
        element: createElement(
          Suspense,
          { fallback: createElement(RouteLoading) },
          Component
            ? createElement(Component)
            : createElement(RouteNotFound, { title: route.title }),
        ),
      })
    })
    return { routeElements, indexPath: flat[0]?.path ?? '/dashboard' }
  }, [menus])
}
