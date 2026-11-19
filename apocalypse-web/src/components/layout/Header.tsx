/**
 * 顶栏：侧栏开关、cmdk 命令面板入口、设置入口（统一承载风格世界与偏好）、用户下拉（个人中心主体页/退出）。
 * layout='topbar' / 'mixed' 时兼任顶部主导航（顶层菜单横排）。
 */

import { ChevronsLeft, LogOut, Menu, Search, Settings2, UserCog } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { MenuIcon } from '@/components/layout/MenuIcon'
import { ApoParticleOrb } from '@/components/motion'
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
import type { MenuNode } from '@/lib/api/types'
import { formatModShortcut } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useTabsStore } from '@/stores/tabs'

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
    <header className="navigation-surface flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle px-4 sm:px-6">
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
              onClick={() => {
                if (menu.path) navigate(menu.path.startsWith('/') ? menu.path : `/${menu.path}`)
              }}
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
        className="gap-2 rounded-full border-border-subtle bg-card/75 px-3 text-muted-foreground shadow-surface transition-colors hover:border-brand-text/40 hover:text-foreground max-sm:size-11 max-sm:px-0"
        onClick={onOpenCommand}
      >
        <ApoParticleOrb size={18} />
        <Search className="size-3.5 sm:hidden" />
        <span className="hidden text-xs font-medium sm:inline">
          {t('common.问问Apo', { defaultValue: '问问 Apo · 搜索或输入 ? 提问' })}
        </span>
        <kbd className="pointer-events-none hidden rounded-full border border-border-subtle bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] sm:inline">
          {formatModShortcut('K')}
        </kbd>
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
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            aria-label={t('common.accountMenu', { name: user?.nickname ?? user?.username ?? '?' })}
          >
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
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <UserCog className="size-4" />
            {t('common.个人中心', { defaultValue: '个人中心' })}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleLogout()} disabled={loggingOut}>
            <LogOut className="size-4" />
            {t('common.退出登录', { defaultValue: '退出登录' })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
