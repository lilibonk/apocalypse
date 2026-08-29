/**
 * cmdk 命令面板：菜单跳转 + 快捷操作（主题切换、打开设置）。⌘K / Ctrl+K 唤起。
 */

import { LayoutDashboard, Moon, Settings2, Sun } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { MenuIcon } from '@/components/layout/MenuIcon'
import { flattenMenuRoutes } from '@/routes/menu-routes'
import { useMenuTitle } from '@/hooks/useMenuTitle'
import { useAuthStore } from '@/stores/auth'
import { useSettings, useSettingsStore } from '@/stores/settings'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenSettings: () => void
}

export function CommandPalette({ open, onOpenChange, onOpenSettings }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const menus = useAuthStore((state) => state.menus)
  const { theme } = useSettings()
  const setTheme = useSettingsStore((state) => state.setTheme)
  const menuTitle = useMenuTitle()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  const routes = flattenMenuRoutes(menus)

  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('common.命令面板', { defaultValue: '命令面板' })}
      description={t('common.搜索菜单与操作', { defaultValue: '搜索菜单与操作' })}
    >
      <CommandInput
        placeholder={t('common.搜索菜单或操作…', { defaultValue: '搜索菜单或操作…' })}
      />
      <CommandList>
        <CommandEmpty>{t('common.没有匹配结果', { defaultValue: '没有匹配结果' })}</CommandEmpty>
        <CommandGroup heading={t('common.菜单', { defaultValue: '菜单' })}>
          <CommandItem
            value={`${t('common.工作台', { defaultValue: '工作台' })} dashboard`}
            onSelect={() => run(() => navigate('/dashboard'))}
          >
            <LayoutDashboard className="size-4" />
            {t('common.工作台', { defaultValue: '工作台' })}
          </CommandItem>
          {routes.map((route) => (
            <CommandItem
              key={route.path}
              value={`${route.title} ${menuTitle(route.title)} ${route.path}`}
              onSelect={() => run(() => navigate(route.path))}
            >
              <MenuIcon name={route.icon} className="size-4" />
              {menuTitle(route.title)}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t('common.操作', { defaultValue: '操作' })}>
          <CommandItem
            value={`${t('common.切换主题', { defaultValue: '切换主题' })} toggle theme`}
            onSelect={() => run(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {t('common.切换主题', { defaultValue: '切换主题' })}
          </CommandItem>
          <CommandItem
            value={`${t('common.界面设置', { defaultValue: '界面设置' })} preferences settings`}
            onSelect={() => run(onOpenSettings)}
          >
            <Settings2 className="size-4" />
            {t('common.界面设置', { defaultValue: '界面设置' })}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
