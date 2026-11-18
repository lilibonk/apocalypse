/**
 * 用户管理：统一单主视图（左部门树过滤 + 多维搜索 + 多选主表 + 原地分配角色/重置密码弹窗 + 侧滑上下文抽屉）。
 * 页面结构事实来源：./user.schema.ts（CI 由 components/dyna/__tests__/schema.test.ts 校验）。
 */

import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import {
  DynaDialogs,
  DynaToolbar,
  DynaToolbarActions,
  useDynaController,
  type DynaAsyncFieldValidator,
} from '@/components/dyna'
import { useDynaText } from '@/components/dyna/use-dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { useEntityIntent, type EntityRouteIntent } from '@/components/navigation'
import { request } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'

import schema from './user.schema'
import { UserAssignRolesDialog, type AssignRoleUserTarget } from './UserAssignRolesDialog'
import { UserForm } from './UserForm'
import { UserResetPasswordDialog, type ResetPasswordUserTarget } from './UserResetPasswordDialog'
import { UserWorkspace, readUserRoles } from './UserWorkspace'

const EXTRA_SEARCH_KEYS = ['deptId', 'includeChildren'] as const

export default function UserPage() {
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const { intent: rawIntent } = useEntityIntent('user')
  const intent = rawIntent ?? undefined
  const instanceKey = JSON.stringify([
    sessionEpoch,
    authorizationEpoch,
    intent?.id,
    intent?.label,
    intent?.deptId,
    intent?.roleId,
  ])

  return <UserPageContent key={instanceKey} intent={intent} />
}

function UserPageContent({ intent }: { intent?: EntityRouteIntent }) {
  const t = useDynaText()
  const queryClient = useQueryClient()
  const [inspectorOpen, setInspectorOpen] = useState(() => Boolean(intent?.id))
  const [assignTarget, setAssignTarget] = useState<AssignRoleUserTarget | null>(null)
  const [resetTarget, setResetTarget] = useState<ResetPasswordUserTarget | null>(null)

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
    extraSearchKeys: EXTRA_SEARCH_KEYS,
    customActions: {
      inspect: (row) => {
        controller.selectRow(String(row.id ?? ''))
        setInspectorOpen(true)
      },
      'assign-roles': (row) => {
        setAssignTarget({
          id: String(row.id ?? ''),
          username: String(row.username ?? ''),
          nickname: row.nickname == null ? null : String(row.nickname),
          roles: readUserRoles(row),
        })
      },
      'reset-password': (row) => {
        setResetTarget({
          id: String(row.id ?? ''),
          username: String(row.username ?? ''),
          nickname: row.nickname == null ? null : String(row.nickname),
        })
      },
    },
    onRefreshCompanion: (overviewKey) => {
      if (overviewKey) {
        void queryClient.invalidateQueries({ queryKey: overviewKey })
      }
    },
  })

  const searchControl = <DynaToolbar controller={controller} presentation="panel" />

  return (
    <div data-theme-stage="" className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t(schema.title)}
        description={schema.description ? t(schema.description) : undefined}
        actions={<DynaToolbarActions controller={controller} />}
      />

      <UserWorkspace
        controller={controller}
        collection={controller.collection}
        filters={controller.filters}
        applyFilters={controller.applyFilters}
        queryKey={controller.queryKey}
        selectedRowKey={controller.selectedRowKey}
        selectRow={controller.selectRow}
        inspectorOpen={inspectorOpen}
        onInspectorOpenChange={setInspectorOpen}
        search={searchControl}
        intent={intent}
        onAssignRoles={setAssignTarget}
        onResetPassword={setResetTarget}
      />

      <DynaDialogs
        controller={controller}
        formComponent={UserForm}
        asyncValidators={asyncValidators}
      />

      <UserAssignRolesDialog
        key={assignTarget ? `roles:${assignTarget.id}` : 'roles:closed'}
        user={assignTarget}
        open={assignTarget !== null}
        onOpenChange={(open) => !open && setAssignTarget(null)}
        onSaved={() => void controller.actions.invalidate()}
      />

      <UserResetPasswordDialog
        key={resetTarget ? `pwd:${resetTarget.id}` : 'pwd:closed'}
        user={resetTarget}
        open={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
      />
    </div>
  )
}
