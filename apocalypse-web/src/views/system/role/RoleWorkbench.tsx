/** 单角色全宽配置工作台：统一承载角色头部概览与业务权限、导航菜单、角色成员三大直编页签。 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, KeyRound, LayoutList, Users } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'

import { RoleMembersTab } from './RoleMembersTab'
import { RoleNavigationTab } from './RoleNavigationTab'
import { RolePermissionsTab } from './RolePermissionsTab'
import { RoleGraphCrudPanel, RoleGraphObjectActions } from './role-graph-crud'
import type { RoleGraphCommand } from './role-graph-crud.model'
import { invalidateRoleGraphQueries } from './role-graph.operations'
import {
  canReadRoleWorkspace,
  type RolePermissionOpening,
  type RolePermissionTarget,
} from './role-permission.model'
import { createRoleChoicesQuery } from './role-permission.queries'

export type WorkbenchTab = 'permissions' | 'navigation' | 'members'

interface PendingMember {
  userId: string
  keyword: string
}

interface RoleWorkbenchProps {
  roleId: string
  roleKey?: string
  initialRole?: RolePermissionTarget | null
  initialTab: WorkbenchTab
  initialFocusId?: string | null
  pendingMember?: PendingMember | null
  principalEpoch: number
  onBack: () => void
  onRoleDeleted: () => void
}

export function RoleWorkbench({
  roleId,
  roleKey = '',
  initialRole = null,
  initialTab,
  initialFocusId = null,
  pendingMember = null,
  principalEpoch,
  onBack,
  onRoleDeleted,
}: RoleWorkbenchProps) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const location = useLocation()
  const [, setSearchParams] = useSearchParams()
  const [workspaceId] = useState(() => crypto.randomUUID())

  const [tab, setTab] = useState<WorkbenchTab>(initialTab)
  const [dirty, setDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<
    { kind: 'back' } | { kind: 'tab'; tab: WorkbenchTab } | null
  >(null)
  const [counts, setCounts] = useState<Partial<Record<WorkbenchTab, number>>>({})
  const [command, setCommand] = useState<RoleGraphCommand | null>(null)

  const choicesResource = useMemo(
    () =>
      createRoleChoicesQuery({
        page: 1,
        keyword: roleKey,
        principalEpoch,
        openId: workspaceId,
      }),
    [roleKey, principalEpoch, workspaceId],
  )
  const roleQuery = useQuery(choicesResource.options)

  useLayoutEffect(() => {
    choicesResource.activate()
    return () => {
      choicesResource.deactivate()
      queueMicrotask(() => {
        if (!choicesResource.disposeIfInactive()) return
        void client.cancelQueries(choicesResource.filter, { revert: false })
        client.removeQueries(choicesResource.filter)
      })
    }
  }, [choicesResource, client])

  useResourceDenial({
    errors: [roleQuery.error],
    clear: choicesResource.filter,
    reset: onBack,
  })

  const fetchedRole = roleQuery.data?.list.find((entry) => entry.id === roleId) ?? null
  const role = fetchedRole ?? (initialRole && initialRole.id === roleId ? initialRole : null)

  const opening = useMemo<RolePermissionOpening | null>(
    () =>
      role
        ? {
            role,
            principalEpoch,
            openId: `${workspaceId}:${role.id}`,
          }
        : null,
    [role, principalEpoch, workspaceId],
  )

  const commitTab = useCallback(
    (nextTab: WorkbenchTab) => {
      setDirty(false)
      setTab(nextTab)
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          next.set('roleRelation', nextTab)
          return next
        },
        { replace: true, state: location.state },
      )
    },
    [setSearchParams, location.state],
  )

  const requestTabChange = (nextTab: WorkbenchTab) => {
    if (nextTab === tab) return
    if (dirty) {
      setPendingNav({ kind: 'tab', tab: nextTab })
      return
    }
    commitTab(nextTab)
  }

  const requestBack = () => {
    if (dirty) {
      setPendingNav({ kind: 'back' })
      return
    }
    onBack()
  }

  const updateCount = useCallback((key: WorkbenchTab, value: number) => {
    setCounts((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }))
  }, [])
  const onPermCount = useCallback((n: number) => updateCount('permissions', n), [updateCount])
  const onNavCount = useCallback((n: number) => updateCount('navigation', n), [updateCount])
  const onMemberCount = useCallback((n: number) => updateCount('members', n), [updateCount])

  const auth = useAuthStore()
  if (!canReadRoleWorkspace(auth) || isResourceDenied(roleQuery.error)) {
    return null
  }

  if (!opening) {
    if (roleQuery.isPending || roleQuery.isFetching) {
      return (
        <div className="w-full min-w-0 space-y-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="size-4" />
              {t('roleManage.backToList')}
            </Button>
          </div>
          <Skeleton className="h-24 w-full rounded-panel" />
          <Skeleton className="h-72 w-full rounded-panel" />
        </div>
      )
    }

    return (
      <div className="w-full min-w-0 space-y-4 p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t('roleManage.backToList')}
        </Button>
        <div
          role="alert"
          className="rounded-panel border border-border-subtle bg-card p-6 text-sm text-muted-foreground"
        >
          {t('roleManage.roleNotFound')}
        </div>
      </div>
    )
  }

  const scopeLabel = role?.dataScope
    ? t(`dataScope.${role.dataScope}`, { defaultValue: role.dataScope })
    : null

  return (
    <div className="w-full min-w-0 space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border-subtle bg-card px-4 py-3.5 shadow-surface">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={requestBack}>
            <ArrowLeft className="size-4" />
            {t('roleManage.backToList')}
          </Button>
          <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:inline-block" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-foreground">{role!.roleName}</h1>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {role!.roleKey}
              </code>
              {role!.status !== null && (
                <Badge variant={role!.status === 1 ? 'success' : 'secondary'}>
                  {t(role!.status === 1 ? 'authorization.active' : 'authorization.inactive')}
                </Badge>
              )}
              {scopeLabel && (
                <Badge variant="outline">
                  {t('authorization.roleScope')} · {scopeLabel}
                </Badge>
              )}
            </div>
            {role!.remark && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{role!.remark}</p>
            )}
          </div>
        </div>

        <RoleGraphObjectActions
          role={role!}
          disabled={dirty}
          onCommand={(kind) => setCommand({ id: crypto.randomUUID(), kind, role: role! })}
        />
      </header>

      <Tabs value={tab} onValueChange={(next) => requestTabChange(next as WorkbenchTab)}>
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto border-b border-border-subtle pb-1"
        >
          <TabsTrigger value="permissions" className="flex-none px-3">
            <KeyRound className="size-4" />
            <span>{t('authorization.permissions')}</span>
            {counts.permissions !== undefined && (
              <Badge variant="outline" className="ml-1 font-mono text-[11px] tabular-nums">
                {counts.permissions}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="navigation" className="flex-none px-3">
            <LayoutList className="size-4" />
            <span>{t('authorization.navigation')}</span>
            {counts.navigation !== undefined && (
              <Badge variant="outline" className="ml-1 font-mono text-[11px] tabular-nums">
                {counts.navigation}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="members" className="flex-none px-3">
            <Users className="size-4" />
            <span>{t('authorization.members')}</span>
            {counts.members !== undefined && (
              <Badge variant="outline" className="ml-1 font-mono text-[11px] tabular-nums">
                {counts.members}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'permissions' && (
        <RolePermissionsTab
          opening={opening}
          initialFocusId={initialFocusId}
          onDirtyChange={setDirty}
          onCountChange={onPermCount}
        />
      )}
      {tab === 'navigation' && (
        <RoleNavigationTab opening={opening} onDirtyChange={setDirty} onCountChange={onNavCount} />
      )}
      {tab === 'members' && (
        <RoleMembersTab
          opening={opening}
          pendingMember={pendingMember}
          onDirtyChange={setDirty}
          onCountChange={onMemberCount}
        />
      )}

      {command && (
        <Dialog open onOpenChange={(open) => !open && setCommand(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {command.kind === 'edit'
                  ? t('roleManage.editProperties')
                  : command.kind === 'toggle'
                    ? t('authorization.toggleRole')
                    : t('roleManage.delete')}
              </DialogTitle>
            </DialogHeader>
            <RoleGraphCrudPanel
              command={command}
              onClose={() => setCommand(null)}
              onCreated={() => setCommand(null)}
              onUpdated={() => {
                setCommand(null)
                void invalidateRoleGraphQueries(client, roleId)
              }}
              onDeleted={() => {
                setCommand(null)
                void invalidateRoleGraphQueries(client, roleId)
                onRoleDeleted()
              }}
              onDenied={() => setCommand(null)}
              clearQueries={{ queryKey: ['system', 'roles'] }}
            />
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog
        open={pendingNav !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNav(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('roleManage.unsavedSwitchTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('roleManage.unsavedSwitchHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('authorization.keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pendingNav
                setPendingNav(null)
                setDirty(false)
                if (action?.kind === 'back') onBack()
                else if (action?.kind === 'tab') commitTab(action.tab)
              }}
            >
              {t('authorization.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
