/**
 * 多页签栏：打开页签、点击切换、关闭（当前页关闭后回工作台）与批量处理。
 * 与路由的同步（location → open tab）在 AppLayout 完成。
 *
 * i18n：store 存菜单原文，本组件经 useMenuTitle 渲染期翻译 ——
 * 切语言时已打开页签同步跟随（useTranslation 订阅 language 变化自动重渲染）。
 */

import { X } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { useMenuTitle } from '@/hooks/useMenuTitle'
import { cn } from '@/lib/utils'
import { isPinnedTab, useTabsStore } from '@/stores/tabs'

import { TabActionsMenu } from './TabActionsMenu'

export function TabBar() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const menuTitle = useMenuTitle()
  const tabs = useTabsStore((state) => state.tabs)
  const activeKey = useTabsStore((state) => state.activeKey)
  const activate = useTabsStore((state) => state.activate)
  const close = useTabsStore((state) => state.close)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  if (tabs.length === 0) return null

  return (
    <div className="flex h-9 shrink-0 border-b border-border">
      <div
        role="tablist"
        aria-label={t('common.已打开页面', { defaultValue: '已打开页面' })}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-3"
      >
        {tabs.map((tab, index) => {
          const active = tab.key === activeKey
          const pinned = isPinnedTab(tab.key)
          const title = menuTitle(tab.title)
          const activateTab = () => {
            activate(tab.key)
            navigate(tab.key)
          }
          const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
            let nextIndex: number | null = null
            if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
            if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
            if (event.key === 'Home') nextIndex = 0
            if (event.key === 'End') nextIndex = tabs.length - 1
            if (nextIndex === null) return
            event.preventDefault()
            const nextTab = tabs[nextIndex]
            activate(nextTab.key)
            navigate(nextTab.key)
            tabRefs.current[nextIndex]?.focus()
          }
          return (
            <div
              key={tab.key}
              className={cn(
                'group flex h-7 items-center rounded-md border border-transparent text-xs whitespace-nowrap transition-colors',
                active
                  ? 'border-border bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <button
                ref={(node) => {
                  tabRefs.current[index] = node
                }}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className={cn(
                  'h-full px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  pinned ? 'rounded-md' : 'rounded-l-md',
                )}
                onClick={activateTab}
                onKeyDown={handleTabKeyDown}
              >
                {title}
              </button>
              {!pinned && (
                <button
                  type="button"
                  aria-label={t('common.closeTab', { title })}
                  className={cn(
                    'mr-0.5 inline-flex size-6 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
                    active && 'opacity-60',
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    const next = close(tab.key)
                    if (next) navigate(next)
                  }}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <TabActionsMenu />
    </div>
  )
}
