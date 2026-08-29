/**
 * 侧边栏：菜单树递归渲染（C 目录可折叠分组 / M 菜单导航项，F 按钮不渲染）。
 * collapsed 时仅显示图标（tooltip 补名）。
 */

import { ChevronRight, LayoutDashboard } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'

import { MotionCollapse } from '@/components/MotionCollapse'
import { MenuIcon } from '@/components/layout/MenuIcon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMenuTitle } from '@/hooks/useMenuTitle'
import type { MenuNode } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { resolveMenuPath } from '@/routes/menu-routes'

function fullPath(node: MenuNode, parentPath: string): string {
  return resolveMenuPath(node.path, parentPath)
}

function branchContainsPath(node: MenuNode, parentPath: string, pathname: string): boolean {
  const path = fullPath(node, parentPath)
  if (node.menuType === 'M') return pathname === path || pathname.startsWith(`${path}/`)
  return node.children.some(
    (child) => child.menuType !== 'F' && branchContainsPath(child, path, pathname),
  )
}

function MenuItemLink({
  node,
  path,
  collapsed,
  depth,
}: {
  node: MenuNode
  path: string
  collapsed: boolean
  depth: number
}) {
  const menuTitle = useMenuTitle()
  // 手动计算 isActive：collapsed 时 link 会被 TooltipTrigger(asChild) 的 Slot 克隆合并 props，
  // NavLink 的函数式 className 会被 Slot 字符串化成源码文本注入 class（样式全废）——
  // 因此必须传静态字符串 className（Slot 只安全合并字符串）。
  const { pathname } = useLocation()
  const isActive = pathname === path || pathname.startsWith(`${path}/`)
  const link = (
    <NavLink
      to={path}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isActive && 'bg-accent font-medium text-foreground',
        collapsed && 'justify-center px-0',
        !collapsed && depth > 0 && 'ml-4',
      )}
    >
      <MenuIcon name={node.icon} />
      {!collapsed && <span className="truncate">{menuTitle(node.menuName)}</span>}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{menuTitle(node.menuName)}</TooltipContent>
    </Tooltip>
  )
}

function MenuGroup({
  node,
  parentPath,
  collapsed,
  depth,
}: {
  node: MenuNode
  parentPath: string
  collapsed: boolean
  depth: number
}) {
  const menuTitle = useMenuTitle()
  const path = fullPath(node, parentPath)
  const { pathname } = useLocation()
  const visibleChildren = node.children.filter((child) => child.menuType !== 'F')
  const activeBranch = visibleChildren.some((child) => branchContainsPath(child, path, pathname))
  const [open, setOpen] = useState(true)
  const contentId = `sidebar-group-${node.id}`

  if (collapsed) {
    // 收起态：目录不展开，直接平铺其子菜单图标
    return (
      <>
        {visibleChildren.map((child) =>
          child.menuType === 'M' ? (
            <MenuItemLink
              key={child.id}
              node={child}
              path={fullPath(child, path)}
              collapsed
              depth={0}
            />
          ) : (
            <MenuGroup key={child.id} node={child} parentPath={path} collapsed depth={depth + 1} />
          ),
        )}
      </>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          activeBranch && 'text-foreground',
          depth > 0 && 'ml-4',
        )}
      >
        <MenuIcon name={node.icon} />
        <span className="flex-1 truncate text-left">{menuTitle(node.menuName)}</span>
        <ChevronRight
          data-slot="motion-disclosure-indicator"
          className={cn('size-3.5 shrink-0', open && 'rotate-90')}
        />
      </button>
      <MotionCollapse open={open} id={contentId} className="mt-0.5 space-y-0.5">
        {visibleChildren.map((child) =>
          child.menuType === 'M' ? (
            <MenuItemLink
              key={child.id}
              node={child}
              path={fullPath(child, path)}
              collapsed={false}
              depth={depth + 1}
            />
          ) : (
            <MenuGroup
              key={child.id}
              node={child}
              parentPath={path}
              collapsed={false}
              depth={depth + 1}
            />
          ),
        )}
      </MotionCollapse>
    </div>
  )
}

export function Sidebar({ menus, collapsed }: { menus: MenuNode[]; collapsed: boolean }) {
  const { pathname } = useLocation()
  const menuTitle = useMenuTitle()
  const topLevel = [...menus]
    .filter((node) => node.menuType !== 'F')
    .sort((a, b) => a.sort - b.sort)

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <NavLink
            to="/dashboard"
            className={cn(
              'mb-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              pathname === '/dashboard' && 'bg-accent font-medium text-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            <LayoutDashboard className="size-4 shrink-0" />
            {!collapsed && <span>{menuTitle('工作台')}</span>}
          </NavLink>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">{menuTitle('工作台')}</TooltipContent>}
      </Tooltip>
      {topLevel.map((node) =>
        node.menuType === 'M' ? (
          <MenuItemLink
            key={node.id}
            node={node}
            path={fullPath(node, '')}
            collapsed={collapsed}
            depth={0}
          />
        ) : (
          <MenuGroup key={node.id} node={node} parentPath="" collapsed={collapsed} depth={0} />
        ),
      )}
    </nav>
  )
}
