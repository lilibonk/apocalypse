/** 页签批量操作：以当前页签为基准关闭左侧、右侧、其他或全部可关闭页签。 */

import { Ellipsis } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DASHBOARD_TAB, isPinnedTab, useTabsStore } from '@/stores/tabs'

export function TabActionsMenu() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const tabs = useTabsStore((state) => state.tabs)
  const activeKey = useTabsStore((state) => state.activeKey)
  const closeLeft = useTabsStore((state) => state.closeLeft)
  const closeRight = useTabsStore((state) => state.closeRight)
  const closeOthers = useTabsStore((state) => state.closeOthers)
  const closeAll = useTabsStore((state) => state.closeAll)

  const activeIndex = tabs.findIndex((tab) => tab.key === activeKey)
  const hasClosableLeft = tabs.some((tab, index) => index < activeIndex && !isPinnedTab(tab.key))
  const hasClosableRight = tabs.some((tab, index) => index > activeIndex && !isPinnedTab(tab.key))
  const hasClosableOther = tabs.some((tab) => tab.key !== activeKey && !isPinnedTab(tab.key))
  const hasClosableTab = tabs.some((tab) => !isPinnedTab(tab.key))

  return (
    <div className="flex shrink-0 items-center border-l border-border px-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('common.tabActions')}
            title={t('common.tabActions')}
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            disabled={!hasClosableLeft}
            onSelect={() => activeKey && closeLeft(activeKey)}
          >
            {t('common.closeLeftTabs')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasClosableRight}
            onSelect={() => activeKey && closeRight(activeKey)}
          >
            {t('common.closeRightTabs')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasClosableOther}
            onSelect={() => activeKey && closeOthers(activeKey)}
          >
            {t('common.closeOtherTabs')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasClosableTab}
            onSelect={() => {
              closeAll()
              navigate(DASHBOARD_TAB.key)
            }}
          >
            {t('common.closeAllTabs')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
