/**
 * 应用骨架：可收侧边栏 + 顶栏（cmdk 入口 / 主题 / 设置 / 用户下拉）+ 多页签 + 内容区。
 *
 * 布局变体（设置面板可切）：
 * - sidebar：经典左侧栏；
 * - topbar：无侧栏，顶层菜单横排进顶栏（目录项点击落到其第一个菜单页）；
 * - mixed：顶栏横排顶层目录，侧栏只显示当前顶层目录的子树。
 *
 * 页面过渡走 PageTransition（受动画开关 + prefers-reduced-motion 治理）。
 * 侧栏使用独立静态品牌签名；PixelOrb 只在登录、加载、空态与结果反馈出现。
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'

import { BrandSignature } from '@/components/BrandSignature'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { Header } from '@/components/layout/Header'
import { SettingsDrawer } from '@/components/layout/SettingsDrawer'
import { Sidebar } from '@/components/layout/Sidebar'
import { TabBar } from '@/components/layout/TabBar'
import { PageTransition } from '@/components/PageTransition'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { MenuNode } from '@/lib/api/types'
import { flattenMenuRoutes, resolveMenuPath } from '@/routes/menu-routes'
import { useAuthStore } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useTabsStore } from '@/stores/tabs'
import { cn } from '@/lib/utils'

/** 目录（C）的第一个可导航后代路径。 */
function firstMenuPath(node: MenuNode, parentPath: string): string | null {
  const path = resolveMenuPath(node.path, parentPath)
  if (node.menuType === 'M' && node.path) return path
  for (const child of [...node.children].sort((a, b) => a.sort - b.sort)) {
    const hit = firstMenuPath(child, path)
    if (hit) return hit
  }
  return null
}

export function AppLayout() {
  const { t } = useTranslation()
  const menus = useAuthStore((state) => state.menus)
  const { layout, tabsEnabled, contentWidth, fixedHeader } = useSettings()
  const location = useLocation()
  const openTab = useTabsStore((state) => state.open)

  const [collapsed, setCollapsed] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // 路由 → 页签同步；页签存菜单原文，翻译在 TabBar 渲染层实时完成（切语言自动跟随）
  useEffect(() => {
    if (!tabsEnabled) return
    const rawTitle =
      location.pathname === '/dashboard'
        ? '工作台'
        : (flattenMenuRoutes(menus).find((route) => route.path === location.pathname)?.title ??
          document.title)
    openTab({ key: location.pathname, title: rawTitle })
  }, [location.pathname, menus, tabsEnabled, openTab])

  const topLevel = useMemo(
    () => [...menus].filter((node) => node.menuType !== 'F').sort((a, b) => a.sort - b.sort),
    [menus],
  )

  // mixed：当前路径所属的顶层目录子树
  const mixedMenus = useMemo(() => {
    const activeTop = topLevel.find((node) => {
      const root = firstMenuPath(node, '')
      if (!root) return false
      const rootSegment = root.split('/')[1]
      return location.pathname.split('/')[1] === rootSegment
    })
    return activeTop?.children.filter((node) => node.menuType !== 'F') ?? topLevel
  }, [topLevel, location.pathname])

  const showSidebar = layout !== 'topbar'
  const sidebarMenus = layout === 'mixed' ? mixedMenus : menus
  const topMenus =
    layout === 'sidebar'
      ? undefined
      : topLevel.map((node) =>
          node.menuType === 'C' ? { ...node, path: firstMenuPath(node, '') } : node,
        )

  return (
    // fixedHeader=on：壳固定、仅内容区滚动；off：整页随窗口滚动（侧栏 sticky 保持可见）
    <div className={cn('flex bg-background', fixedHeader ? 'h-svh overflow-hidden' : 'min-h-svh')}>
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-[60] -translate-y-16 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t('common.跳到主要内容', { defaultValue: '跳到主要内容' })}
      </a>
      {showSidebar && (
        <aside
          data-slot="app-sidebar"
          className={cn(
            'hidden shrink-0 flex-col border-r border-border bg-muted/20 transition-[width] md:flex',
            collapsed ? 'w-24' : 'w-56',
            !fixedHeader && 'sticky top-0 h-svh',
          )}
        >
          <div
            className={cn(
              'shrink-0 border-b border-border',
              collapsed
                ? 'grid h-16 w-full place-items-center'
                : 'flex h-20 items-center gap-3 px-4',
            )}
          >
            <BrandSignature compact={collapsed} />
          </div>
          <Sidebar menus={sidebarMenus} collapsed={collapsed} />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((value) => !value)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenCommand={() => setCommandOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          topMenus={topMenus}
        />
        {tabsEnabled && (
          <div className="hidden md:block">
            <TabBar />
          </div>
        )}

        <main
          id="main-content"
          tabIndex={-1}
          className={cn('min-h-0 flex-1 overflow-x-hidden', fixedHeader && 'overflow-y-auto')}
        >
          {/* contentWidth=boxed：内容限宽居中；fluid：通栏 */}
          <div className={cn(contentWidth === 'boxed' && 'mx-auto w-full max-w-7xl')}>
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0 md:hidden">
          <SheetHeader className="border-b border-border px-4 py-4 text-left">
            <SheetTitle className="sr-only">导航</SheetTitle>
            <BrandSignature />
          </SheetHeader>
          <div
            onClick={(event) => {
              // Expanding a directory is not navigation. Otherwise collapsed mobile menus are unusable.
              if (event.target instanceof Element && event.target.closest('a[href]'))
                setMobileNavOpen(false)
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Sidebar menus={sidebarMenus} collapsed={false} />
          </div>
        </SheetContent>
      </Sheet>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
