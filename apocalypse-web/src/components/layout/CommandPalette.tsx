/**
 * cmdk 命令面板：最近访问、授权菜单跳转、显式外观/偏好动作，以及输入 `?` 进入的确定性问答。
 * ⌘K / Ctrl+K 唤起。问答由各模块 `command-questions.tsx` 提供（构建期发现），核心布局不依赖业务模块。
 */

import {
  Check,
  CircleHelp,
  Clock3,
  Gauge,
  Languages,
  LayoutDashboard,
  Monitor,
  Moon,
  Rows3,
  Settings2,
  Sun,
  Zap,
  ZapOff,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
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
import { commandQuestionProviders } from '@/components/layout/command-extensions'
import { flattenMenuRoutes } from '@/routes/menu-routes'
import { useMenuTitle } from '@/hooks/useMenuTitle'
import { useAuthStore } from '@/stores/auth'
import { useRecentRoutes } from '@/stores/recent-routes'
import {
  isCapabilityExposed,
  useSettings,
  useSettingsStore,
  type CapabilityKey,
} from '@/stores/settings'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenSettings: () => void
}

interface PreferenceAction {
  key: string
  capability: CapabilityKey
  label: string
  keywords: string
  icon: LucideIcon
  active: boolean
  run: () => void
}

export function CommandPalette({ open, onOpenChange, onOpenSettings }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const menus = useAuthStore((state) => state.menus)
  const userId = useAuthStore((state) => state.user?.id)
  const auth = useAuthStore()
  const settings = useSettings()
  const store = useSettingsStore()
  const menuTitle = useMenuTitle()
  const recentPaths = useRecentRoutes((state) => state.forOwner(userId))
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const input = useRef<HTMLInputElement>(null)
  /** Providers and the ask action set the query; typing must keep going in the input. */
  const setQueryAndFocus = (value: string) => {
    setSearch(value)
    requestAnimationFrame(() => input.current?.focus())
  }

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
  // Recent pages are re-checked against the current authorized routes on every render.
  const recent = recentPaths.flatMap((path) => routes.filter((route) => route.path === path))
  const question = search.startsWith('?') || search.startsWith('？')
  const providers = commandQuestionProviders.filter((provider) => provider.canAsk(auth))

  const changeOpen = (next: boolean) => {
    if (!next) setSearch('')
    onOpenChange(next)
  }
  const run = (action: () => void) => {
    changeOpen(false)
    action()
  }

  const preferences: PreferenceAction[] = (
    [
      {
        key: 'theme-light',
        capability: 'theme',
        label: t('command.themeLight'),
        keywords: 'light theme 浅色 外观',
        icon: Sun,
        active: settings.theme === 'light',
        run: () => store.setTheme('light'),
      },
      {
        key: 'theme-dark',
        capability: 'theme',
        label: t('command.themeDark'),
        keywords: 'dark theme 深色 暗色 外观',
        icon: Moon,
        active: settings.theme === 'dark',
        run: () => store.setTheme('dark'),
      },
      {
        key: 'theme-system',
        capability: 'theme',
        label: t('command.themeSystem'),
        keywords: 'system theme 跟随系统 外观',
        icon: Monitor,
        active: settings.theme === 'system',
        run: () => store.setTheme('system'),
      },
      {
        key: 'density-comfortable',
        capability: 'density',
        label: t('command.densityComfortable'),
        keywords: 'comfortable density 舒适 密度',
        icon: Rows3,
        active: settings.density === 'comfortable',
        run: () => store.setDensity('comfortable'),
      },
      {
        key: 'density-compact',
        capability: 'density',
        label: t('command.densityCompact'),
        keywords: 'compact density 紧凑 密度',
        icon: Gauge,
        active: settings.density === 'compact',
        run: () => store.setDensity('compact'),
      },
      {
        key: 'language-zh',
        capability: 'language',
        label: '中文',
        keywords: 'chinese language 中文 语言',
        icon: Languages,
        active: settings.language === 'zh',
        run: () => store.setLanguage('zh'),
      },
      {
        key: 'language-en',
        capability: 'language',
        label: 'English',
        keywords: 'english language 英文 语言',
        icon: Languages,
        active: settings.language === 'en',
        run: () => store.setLanguage('en'),
      },
      {
        key: 'motion-on',
        capability: 'motion',
        label: t('command.motionOn'),
        keywords: 'motion animation on 动画 开启',
        icon: Zap,
        active: settings.motionEnabled,
        run: () => store.setMotionEnabled(true),
      },
      {
        key: 'motion-off',
        capability: 'motion',
        label: t('command.motionOff'),
        keywords: 'motion animation off reduce 动画 关闭',
        icon: ZapOff,
        active: !settings.motionEnabled,
        run: () => store.setMotionEnabled(false),
      },
    ] satisfies PreferenceAction[]
  ).filter((action) => isCapabilityExposed(action.capability))

  const title = t('common.命令面板', { defaultValue: '命令面板' })
  return (
    <CommandDialog
      open={open}
      onOpenChange={changeOpen}
      title={title}
      description={t('common.搜索菜单与操作', { defaultValue: '搜索菜单与操作' })}
      commandProps={{
        shouldFilter: !question,
        label: title,
        loop: true,
        value: selected,
        onValueChange: setSelected,
      }}
    >
      <CommandInput
        ref={input}
        aria-label={t('common.搜索菜单与操作', { defaultValue: '搜索菜单与操作' })}
        placeholder={t('command.placeholder')}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList data-adaptive="">
        {question ? (
          providers.length ? (
            providers.map((provider) => (
              // Panels are route-owned and may be lazy chunks; the descriptor stays eager.
              <Suspense
                key={provider.id}
                fallback={
                  <p role="status" className="px-4 py-6 text-sm text-muted-foreground">
                    {t('command.loadingQuestions')}
                  </p>
                }
              >
                <provider.Panel
                  query={search.slice(1)}
                  setQuery={(query) => setQueryAndFocus(`?${query}`)}
                  routes={routes}
                  navigate={(path) => run(() => navigate(path))}
                  highlight={setSelected}
                />
              </Suspense>
            ))
          ) : (
            <p role="status" className="px-4 py-6 text-sm text-muted-foreground">
              {commandQuestionProviders[0]?.deniedHint(t) ?? t('command.questionsUnavailable')}
            </p>
          )
        ) : (
          <>
            <CommandEmpty>
              {t('common.没有匹配结果', { defaultValue: '没有匹配结果' })}
            </CommandEmpty>
            {recent.length > 0 && (
              <CommandGroup heading={t('command.recent')}>
                {recent.map((route) => (
                  <CommandItem
                    key={`recent-${route.path}`}
                    value={`recent ${route.title} ${menuTitle(route.title)} ${route.path}`}
                    onSelect={() => run(() => navigate(route.path))}
                  >
                    <Clock3 className="size-4" />
                    {menuTitle(route.title)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
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
            <CommandGroup heading={t('command.preferences')}>
              {preferences.map((action) => (
                <CommandItem
                  key={action.key}
                  value={`${action.label} ${action.keywords}`}
                  onSelect={() => run(action.run)}
                >
                  <action.icon className="size-4" />
                  <span className="flex-1">{action.label}</span>
                  {action.active && (
                    <Check className="size-4 text-brand-text" aria-label={t('command.current')} />
                  )}
                </CommandItem>
              ))}
              <CommandItem
                value={`${t('common.界面设置', { defaultValue: '界面设置' })} preferences settings`}
                onSelect={() => run(onOpenSettings)}
              >
                <Settings2 className="size-4" />
                {t('common.界面设置', { defaultValue: '界面设置' })}
              </CommandItem>
              {commandQuestionProviders.length > 0 && (
                <CommandItem
                  value={`? ${t('command.askQuestion')} question ask 提问`}
                  onSelect={() => setQueryAndFocus('?')}
                >
                  <CircleHelp className="size-4" />
                  {t('command.askQuestion')}
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div
        data-slot="command-footer"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle px-4 py-2 text-xs text-muted-foreground"
      >
        <span>
          <kbd className="font-sans">↑↓</kbd> {t('command.hintSelect')}
        </span>
        <span>
          <kbd className="font-sans">↵</kbd> {t('command.hintOpen')}
        </span>
        <span>
          <kbd className="font-sans">Esc</kbd> {t('command.hintClose')}
        </span>
        <span className="ml-auto">
          {question ? t('command.hintLeaveQuestion') : t('command.hintQuestion')}
        </span>
      </div>
    </CommandDialog>
  )
}
