/**
 * 顶栏：侧栏开关、cmdk 命令面板入口、主题快捷切换、设置入口、用户下拉。
 * layout='topbar' / 'mixed' 时兼任顶部主导航（顶层菜单横排）。
 */

import { ChevronsLeft, LogOut, Menu, Moon, Search, Settings2, Sun } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { MenuIcon } from '@/components/layout/MenuIcon'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMenuTitle } from '@/hooks/useMenuTitle'
import { useTabsStore } from '@/stores/tabs'
import { useAuthStore } from '@/stores/auth'
import { useSettings, useSettingsStore } from '@/stores/settings'
import type { MenuNode } from '@/lib/api/types'
import { cn } from '@/lib/utils'

interface HeaderProps {
  collapsed: boolean
  onToggleSidebar: () => void
  onOpenMobileNav: () => void
  onOpenCommand: () => void
  onOpenSettings: () => void
  /** topbar / mixed 模式传入顶层菜单。 */
  topMenus?: MenuNode[]
}

export function Header({
  collapsed,
  onToggleSidebar,
  onOpenMobileNav,
  onOpenCommand,
  onOpenSettings,
  topMenus,
}: HeaderProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const resetTabs = useTabsStore((state) => state.reset)
  const { theme } = useSettings()
  const setTheme = useSettingsStore((state) => state.setTheme)
  const menuTitle = useMenuTitle()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await logout()
      resetTabs()
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('common.注销失败', { defaultValue: '注销失败，请重试' }),
      )
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMobileNav}
        aria-label={t('common.打开导航', { defaultValue: '打开导航' })}
      >
        <Menu className="size-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={onToggleSidebar}
        aria-label={
          collapsed
            ? t('common.展开侧边栏', { defaultValue: '展开侧边栏' })
            : t('common.收起侧边栏', { defaultValue: '收起侧边栏' })
        }
      >
        <ChevronsLeft className={cn('size-4 transition-transform', collapsed && 'rotate-180')} />
      </Button>

      {topMenus && topMenus.length > 0 && (
        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {topMenus.map((menu) => (
            <Button
              key={menu.id}
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() =>
                menu.path && navigate(menu.path.startsWith('/') ? menu.path : `/${menu.path}`)
              }
            >
              <MenuIcon name={menu.icon} className="size-3.5" />
              {menuTitle(menu.menuName)}
            </Button>
          ))}
        </nav>
      )}

      <div className="flex-1" />

      <Button
        variant="outline"
        size="sm"
        aria-label={t('common.搜索', { defaultValue: '搜索' })}
        className="gap-2 text-muted-foreground max-sm:size-9 max-sm:px-0"
        onClick={onOpenCommand}
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">{t('common.搜索', { defaultValue: '搜索' })}</span>
        <kbd className="pointer-events-none hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label={t('common.切换主题', { defaultValue: '切换主题' })}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label={t('common.设置', { defaultValue: '设置' })}
        onClick={onOpenSettings}
      >
        <Settings2 className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Avatar size="sm">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                {(user?.nickname ?? user?.username ?? '?').slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline">{user?.nickname ?? user?.username}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>{user?.nickname ?? user?.username}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user?.deptName ?? user?.username}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void handleLogout()} disabled={loggingOut}>
            <LogOut className="size-4" />
            {t('common.退出登录', { defaultValue: '退出登录' })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
