/**
 * 用户管理：基于 Headless `useDynaController` + `UserWorkspace`（StickyCompactRailLayout + 活水关系舞台）
 * 与标准 `DynaTable` 列表双视图。
 * 页面结构事实来源：./user.schema.ts（CI 由 components/dyna/__tests__/schema.test.ts 校验）。
 */

import { useQueryClient } from '@tanstack/react-query'
import { LayoutDashboard, List } from 'lucide-react'
import { useMemo } from 'react'

import {
  DynaDialogs,
  DynaTable,
  DynaToolbar,
  DynaToolbarActions,
  useDynaController,
  type DynaAsyncFieldValidator,
} from '@/components/dyna'
import { useDynaText } from '@/components/dyna/use-dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { LivingContextBar, useEntityIntent, type EntityRouteIntent } from '@/components/navigation'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'
import { request } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'

import schema from './user.schema'
import { UserForm } from './UserForm'
import { UserWorkspace } from './UserWorkspace'

type UserPageView = 'workspace' | 'list'
const USER_PAGE_VIEWS = ['workspace', 'list'] as const

export default function UserPage() {
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const { intent: rawIntent } = useEntityIntent('user')
  const intent = rawIntent ?? undefined
  const desktop = useDesktopViewport()
  const [view, setView] = usePageView<UserPageView>(USER_PAGE_VIEWS)
  const activeView: UserPageView = desktop ? view : 'list'
  const instanceKey = JSON.stringify([
    sessionEpoch,
    authorizationEpoch,
    intent?.id,
    intent?.label,
    intent?.deptId,
    intent?.roleId,
  ])

  return (
    <UserPageContent
      key={instanceKey}
      intent={intent}
      view={activeView}
      onViewChange={desktop ? setView : undefined}
    />
  )
}

function UserPageContent({
  intent,
  view,
  onViewChange,
}: {
  intent?: EntityRouteIntent
  view: UserPageView
  onViewChange?: (view: UserPageView) => void
}) {
  const t = useDynaText()
  const queryClient = useQueryClient()
  const asyncValidators = useMemo<Record<string, DynaAsyncFieldValidator>>(
    () => ({
      username: async (value) => {
        const trimmed = value.trim()
        if (!trimmed) return null
        try {
          const available = await request<boolean>('/system/users/check-username', {
            query: { username: trimmed },
          })
          return available === false ? '用户名已存在' : null
        } catch {
          return null
        }
      },
    }),
    [],
  )

  const controller = useDynaController(schema, {
    entityIntent: intent,
    onRefreshCompanion: (overviewKey) => {
      if (overviewKey) {
        void queryClient.invalidateQueries({ queryKey: overviewKey })
      }
    },
  })

  const viewControl = onViewChange ? (
    <SegmentedControl
      label={t('pageView')}
      value={view}
      onChange={onViewChange}
      options={[
        { value: 'workspace', label: t('viewWorkspace'), icon: LayoutDashboard },
        { value: 'list', label: t('viewList'), icon: List },
      ]}
    />
  ) : undefined

  const searchControl = (
    <DynaToolbar
      controller={controller}
      presentation={view === 'workspace' ? 'toolbar' : 'panel'}
    />
  )

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t(schema.title)}
        description={schema.description ? t(schema.description) : undefined}
        view={viewControl}
        actions={<DynaToolbarActions controller={controller} />}
      />

      {view === 'workspace' ? (
        <UserWorkspace
          controller={controller}
          collection={controller.collection}
          filters={controller.filters}
          applyFilters={controller.applyFilters}
          queryKey={controller.queryKey}
          selectedRowKey={controller.selectedRowKey}
          selectRow={controller.selectRow}
          search={searchControl}
          intent={intent}
        />
      ) : (
        <>
          {intent?.source && <LivingContextBar source={intent.source} />}
          {searchControl}
          <DynaTable {...controller.collection} />
        </>
      )}

      <DynaDialogs
        controller={controller}
        formComponent={UserForm}
        asyncValidators={asyncValidators}
      />
    </div>
  )
}
