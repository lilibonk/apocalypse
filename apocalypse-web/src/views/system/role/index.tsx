/**
 * 角色管理：
 * - 默认呈现单一主表（角色列表 CRUD + 授权配置入口）
 * - 点击“授权配置”或带角色路由意图进入时，在同一路由全宽钻取至 RoleWorkbench（业务权限 / 导航菜单 / 角色成员）
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router'

import { DynaPage } from '@/components/dyna'
import { LivingContextBar, useEntityIntent } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRealtimePulse } from '@/lib/realtime/use-realtime-pulse'
import { useAuthStore } from '@/stores/auth'

import { localizeRoleSchema, RoleForm } from './RoleForm'
import { RoleMembersTab } from './RoleMembersTab'
import { RoleWorkbench, type WorkbenchTab } from './RoleWorkbench'
import { canReadRoleWorkspace, type RolePermissionTarget } from './role-permission.model'
import { RoleGraphCrudPanel } from './role-graph-crud'
import type { RoleGraphCommand } from './role-graph-crud.model'
import { invalidateRoleGraphQueries } from './role-graph.operations'
import schema from './role.schema'

type Row = Record<string, unknown>

function targetOf(row: Row): RolePermissionTarget {
  return {
    id: String(row.id ?? ''),
    roleName: String(row.roleName ?? ''),
    roleKey: String(row.roleKey ?? ''),
    status: typeof row.status === 'number' ? row.status : null,
    dataScope: typeof row.dataScope === 'string' ? row.dataScope : null,
    ...(typeof row.authorizationRevision === 'string'
      ? { authorizationRevision: row.authorizationRevision }
      : {}),
    ...(Object.hasOwn(row, 'sort') ? { sort: typeof row.sort === 'number' ? row.sort : null } : {}),
    ...(Object.hasOwn(row, 'remark')
      ? { remark: typeof row.remark === 'string' ? row.remark : null }
      : {}),
  }
}

function normalizeTab(raw: string | null | undefined): WorkbenchTab {
  if (raw === 'navigation' || raw === 'menus') return 'navigation'
  if (raw === 'members') return 'members'
  return 'permissions'
}

/** Compat dialog for caller tests / direct member opening without leaving another view. */
export function GrantUsersDialog({
  role,
  onClose,
}: {
  role: { id: string; roleName: string }
  onClose: () => void
}) {
  const { t } = useTranslation('system')
  const epoch = useAuthStore((state) => state.sessionEpoch)
  const [opening] = useState(() => ({
    role: targetOf(role),
    principalEpoch: epoch,
    openId: crypto.randomUUID(),
  }))
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('authorization.members')}</DialogTitle>
        </DialogHeader>
        <RoleMembersTab opening={opening} />
      </DialogContent>
    </Dialog>
  )
}

const ROLE_PULSE_KEYS = [
  ['dyna', '/system/roles', 'system-role'],
  ['system', 'roles'],
  ['system', 'authorization', 'insights'],
] as const
const ROLE_PULSE_TOPICS = ['authorizationChanged'] as const

export default function RolePage() {
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  return <RolePageContent key={authorizationEpoch} />
}

function RolePageContent() {
  const { t } = useTranslation('system')
  const auth = useAuthStore()
  const client = useQueryClient()
  useRealtimePulse({ queryKeys: ROLE_PULSE_KEYS, topics: ROLE_PULSE_TOPICS })

  const localizedSchema = useMemo(
    () => ({ ...localizeRoleSchema(schema, t), description: undefined }),
    [t],
  )
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const { intent } = useEntityIntent('role')

  const [pickedRole, setPickedRole] = useState<RolePermissionTarget | null>(null)
  const [command, setCommand] = useState<RoleGraphCommand | null>(null)
  const [pendingMember, setPendingMember] = useState<{
    userId: string
    keyword: string
  } | null>(() =>
    entityIntentMemberCandidate(intent, searchParams)
      ? {
          userId: intent!.focusTargetId!,
          keyword: intent!.label ?? intent!.focusTargetId!,
        }
      : null,
  )

  const targetRoleId =
    searchParams.get('roleId') ??
    searchParams.get('focusId') ??
    (!pendingMember ? (intent?.id ?? null) : null)
  const targetRoleKey = searchParams.get('roleKey') ?? ''
  const initialTab = normalizeTab(searchParams.get('roleRelation') ?? intent?.relation)
  const initialFocusId = searchParams.get('focus') ?? intent?.focusTargetId ?? null

  const openWorkbench = useCallback(
    (role: RolePermissionTarget, relation?: WorkbenchTab) => {
      const nextRelation = relation ?? (pendingMember ? 'members' : 'permissions')
      setPickedRole(role)
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          next.delete('focusId')
          next.delete('roleView')
          next.set('roleId', role.id)
          next.set('roleKey', role.roleKey)
          next.set('roleRelation', nextRelation)
          return next
        },
        { replace: true, state: location.state },
      )
    },
    [pendingMember, setSearchParams, location.state],
  )

  const returnToList = useCallback(() => {
    setPickedRole(null)
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('roleId')
        next.delete('roleKey')
        next.delete('roleRelation')
        next.delete('focusId')
        next.delete('focus')
        next.delete('roleView')
        return next
      },
      { replace: true, state: location.state },
    )
    void invalidateRoleGraphQueries(client)
  }, [setSearchParams, location.state, client])

  useLayoutEffect(
    () =>
      useAuthStore.subscribe((current) => {
        if (current.meLoaded && !canReadRoleWorkspace(current) && targetRoleId) {
          returnToList()
        }
      }),
    [targetRoleId, returnToList],
  )

  const customActions = useMemo(
    () => ({
      'configure-role': (row: Row) => openWorkbench(targetOf(row)),
      'toggle-role': (row: Row) =>
        setCommand({ id: crypto.randomUUID(), kind: 'toggle', role: targetOf(row) }),
    }),
    [openWorkbench],
  )

  if (targetRoleId && canReadRoleWorkspace(auth)) {
    return (
      <RoleWorkbench
        key={`${targetRoleId}:${auth.sessionEpoch}`}
        roleId={targetRoleId}
        roleKey={targetRoleKey}
        initialRole={pickedRole}
        initialTab={initialTab}
        initialFocusId={initialFocusId}
        pendingMember={pendingMember}
        principalEpoch={auth.sessionEpoch}
        onBack={returnToList}
        onRoleDeleted={returnToList}
      />
    )
  }

  return (
    <>
      <div className="w-full min-w-0 space-y-4">
        {(intent?.source || pendingMember) && (
          <div className="space-y-3 px-4 pt-4 sm:px-6 sm:pt-6">
            <LivingContextBar source={intent?.source} />
            {pendingMember && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-brand-text/40 bg-primary/5 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {t('roleManage.pendingMember', { name: pendingMember.keyword })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('roleManage.pendingMemberHint', { id: pendingMember.userId })}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setPendingMember(null)}
                >
                  {t('authorization.close')}
                </Button>
              </div>
            )}
          </div>
        )}

        <DynaPage schema={localizedSchema} customActions={customActions} formComponent={RoleForm} />
      </div>

      {command && (
        <Dialog open onOpenChange={(open) => !open && setCommand(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('authorization.toggleRole')}</DialogTitle>
            </DialogHeader>
            <RoleGraphCrudPanel
              command={command}
              onClose={() => setCommand(null)}
              onCreated={() => setCommand(null)}
              onUpdated={() => setCommand(null)}
              onDeleted={() => setCommand(null)}
              onDenied={() => setCommand(null)}
              clearQueries={{ queryKey: ['system', 'roles'] }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function entityIntentMemberCandidate(
  intent: ReturnType<typeof useEntityIntent>['intent'],
  searchParams: URLSearchParams,
): boolean {
  return Boolean(
    intent?.relation === 'members' &&
    intent.focusTargetId &&
    !searchParams.get('roleId') &&
    intent.id === intent.focusTargetId,
  )
}
