/**
 * 用户管理统一工作台（单主视图：左部门过滤轨 + 多维搜索 + 全功能多选主表 + 按需侧滑账号上下文抽屉）。
 * - 废除旧版工作区/列表双页签割裂与跨路由跳去角色页配角色的反人类流程；
 * - 剔除后端 UserResp 不存在的 email / phone / remark 假字段；
 * - 分配角色与重置密码全部在本页弹窗闭环完成；关联实体使用 EntityPeekLink 原位速览。
 */

import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Building2,
  ChevronRight,
  CircleUserRound,
  FolderTree,
  KeyRound,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Wifi,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DictTag } from '@/components/DictTag'
import {
  DynaTable,
  type DynaColumn,
  type DynaController,
  type DynaTableProps,
} from '@/components/dyna'
import { MetricValue, PulseIndicator } from '@/components/motion'
import { EntityPeekLink, LivingContextBar, type EntityRouteIntent } from '@/components/navigation'
import { ResponsiveInspector } from '@/components/spatial'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ApiError, request } from '@/lib/api/client'
import type { DeptPathNode, UserRoleSummary } from '@/lib/api/types'
import { isResourceDenied } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

import { listOnlineUsers, type OnlineUserRow } from '../online/online.api'
import { getAuthorizationOverview } from '../role/authorization-insight.api'
import { canAskAuthorizationQuestions } from '../role/authorization-questions.model'
import type { AssignRoleUserTarget } from './UserAssignRolesDialog'
import type { ResetPasswordUserTarget } from './UserResetPasswordDialog'

const value = (row: Record<string, unknown>, key: string) =>
  row[key] == null ? '' : String(row[key])

export function readDeptPath(row: Record<string, unknown>): DeptPathNode[] {
  if (Array.isArray(row.deptPath) && row.deptPath.length > 0) {
    return row.deptPath.filter((item): item is DeptPathNode =>
      Boolean(item && typeof item === 'object' && 'id' in item && 'deptName' in item),
    )
  }
  const deptName = value(row, 'deptName')
  const deptId = value(row, 'deptId')
  if (deptId || deptName) {
    return [{ id: deptId || deptName, deptName: deptName || deptId }]
  }
  return []
}

export function readUserRoles(row: Record<string, unknown>): UserRoleSummary[] {
  if (!Array.isArray(row.roles)) return []
  return row.roles.filter((item): item is UserRoleSummary =>
    Boolean(item && typeof item === 'object' && 'id' in item && 'roleName' in item),
  )
}

interface DeptTreeApiNode {
  id: string
  parentId: string
  deptName: string
  status?: number
  children?: DeptTreeApiNode[]
}

function DeptFilterTree({
  nodes,
  depth = 0,
  selectedDeptId,
  onSelect,
}: {
  nodes: readonly DeptTreeApiNode[]
  depth?: number
  selectedDeptId: string
  onSelect: (deptId: string) => void
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const id = String(node.id)
        const active = selectedDeptId === id
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={active}
              style={{ paddingLeft: `${0.65 + depth * 0.85}rem` }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-1.5 rounded-control py-1.5 pr-2.5 text-left text-xs transition-colors',
                active
                  ? 'bg-primary/14 font-semibold text-brand-text'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Building2 className="size-3.5 shrink-0 opacity-75" aria-hidden="true" />
              <span className="truncate">{node.deptName}</span>
            </button>
            {node.children && node.children.length > 0 && (
              <DeptFilterTree
                nodes={node.children}
                depth={depth + 1}
                selectedDeptId={selectedDeptId}
                onSelect={onSelect}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function UserDossierContent({
  selected,
  onlineSessions,
  onlineError,
  canViewOnline,
  canViewLoginLog,
  canEdit,
  onEdit,
  onAssignRoles,
  onResetPassword,
}: {
  selected: Record<string, unknown>
  onlineSessions: OnlineUserRow[]
  onlineError: boolean
  canViewOnline: boolean
  canViewLoginLog: boolean
  canEdit: boolean
  onEdit?: (row: Record<string, unknown>) => void
  onAssignRoles?: (user: AssignRoleUserTarget) => void
  onResetPassword?: (user: ResetPasswordUserTarget) => void
}) {
  const { t } = useTranslation('system')
  const selectedId = value(selected, 'id')
  const username = value(selected, 'username')
  const nickname = value(selected, 'nickname')
  const name = nickname || username
  const deptPath = readDeptPath(selected)
  const deptFullText =
    deptPath.length > 0
      ? deptPath.map((d) => d.deptName).join(' / ')
      : t('objectWorkspace.unspecified')
  const roles = readUserRoles(selected)
  const sourceRef = { kind: 'user' as const, id: selectedId, label: name }

  return (
    <section
      role="region"
      aria-label={t('objectWorkspace.accountDetails')}
      className="divide-y divide-border-subtle"
    >
      {/* 头部摘要 + 本页原地快捷操作 */}
      <div className="space-y-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-brand-text/40 bg-primary/14 text-base font-semibold text-brand-text"
              aria-hidden="true"
            >
              {name.slice(0, 1)}
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-lg font-semibold text-foreground">{name}</h2>
                <DictTag type="sys_user_status" value={String(selected.status)} />
              </div>
              <p className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <CircleUserRound className="size-3.5" aria-hidden="true" />@{username}
              </p>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {onEdit && (
              <Button type="button" size="xs" variant="outline" onClick={() => onEdit(selected)}>
                <Pencil className="size-3.5" />
                编辑资料
              </Button>
            )}
            {onAssignRoles && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() =>
                  onAssignRoles({
                    id: selectedId,
                    username,
                    nickname: nickname || null,
                    roles,
                  })
                }
              >
                <ShieldCheck className="size-3.5" />
                分配角色
              </Button>
            )}
            {onResetPassword && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() =>
                  onResetPassword({
                    id: selectedId,
                    username,
                    nickname: nickname || null,
                  })
                }
              >
                <KeyRound className="size-3.5" />
                重置密码
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 真实基础与组织档案（零虚假占位字段） */}
      <div className="py-4" data-testid="user-dept-chain">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{t('objectWorkspace.username')}</dt>
            <dd className="mt-0.5 font-mono text-foreground">{username || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('objectWorkspace.nickname')}</dt>
            <dd className="mt-0.5 font-medium text-foreground">{nickname || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{t('objectWorkspace.department')}</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {deptPath.length > 0 ? (
                <EntityPeekLink
                  kind="dept"
                  id={String(deptPath[deptPath.length - 1]!.id)}
                  label={deptFullText}
                  source={sourceRef}
                />
              ) : (
                deptFullText
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{t('objectWorkspace.created')}</dt>
            <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
              {value(selected, 'createTime').replace('T', ' ') || '—'}
            </dd>
          </div>
        </dl>
      </div>

      {/* 生效角色：直接弹窗闭环分配 + 原位 EntityPeekLink 预览 */}
      <div className="space-y-3 py-4" data-testid="user-roles-stage">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-4 text-amber-600 dark:text-amber-400" />
            <span>持有角色</span>
            <Badge variant="secondary" className="font-mono tabular-nums">
              {roles.length}
            </Badge>
          </div>
          {canEdit && onAssignRoles && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() =>
                onAssignRoles({
                  id: selectedId,
                  username,
                  nickname: nickname || null,
                  roles,
                })
              }
            >
              <ShieldCheck className="size-3.5" />
              {t('objectWorkspace.manageRoles')}
            </Button>
          )}
        </div>

        {roles.length > 0 ? (
          <ul className="divide-y divide-border-subtle/60 text-sm">
            {roles.map((role) => (
              <li
                key={role.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <EntityPeekLink
                    kind="role"
                    id={String(role.id)}
                    label={role.roleName}
                    sublabel={role.roleKey}
                    relation="members"
                    focusTargetId={selectedId}
                    source={sourceRef}
                  />
                  <code className="font-mono text-xs text-muted-foreground">{role.roleKey}</code>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={Number(role.status) === 1 ? 'success' : 'secondary'}>
                    {t(
                      Number(role.status) === 1 ? 'authorization.active' : 'authorization.inactive',
                    )}
                  </Badge>
                  {role.dataScope && (
                    <Badge variant="outline">
                      {t(`dataScope.${role.dataScope}`, { defaultValue: role.dataScope })}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="size-4 text-amber-500" aria-hidden="true" />
            {t('objectWorkspace.withoutRoles')}
          </p>
        )}
      </div>

      {/* 实时活跃在线状态与登录活动 */}
      {(canViewOnline || canViewLoginLog) && (
        <div className="space-y-2.5 pt-4" data-testid="user-sessions-stage">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Activity className="size-4 text-cyan-600 dark:text-cyan-400" />
              <span>{t('objectWorkspace.online')}</span>
              {canViewOnline && !onlineError && (
                <span className="inline-flex items-center gap-1.5">
                  {onlineSessions.length > 0 && <PulseIndicator tone="brand" />}
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    {onlineSessions.length}
                  </Badge>
                </span>
              )}
            </div>
            {canViewLoginLog && (
              <EntityPeekLink
                kind="log-login"
                id={username}
                label={t('objectWorkspace.loginActivity')}
                source={sourceRef}
                className="text-xs"
              />
            )}
          </div>

          {canViewOnline &&
            (onlineSessions.length > 0 ? (
              <ul className="divide-y divide-border-subtle/60 text-xs">
                {onlineSessions.map((session) => (
                  <li
                    key={session.jti}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
                  >
                    <EntityPeekLink
                      kind="session"
                      id={session.username}
                      label={session.userAgent || session.username}
                      sublabel={session.ip ?? undefined}
                      source={sourceRef}
                    />
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="font-mono">{session.ip || '—'}</span>
                      {session.loginTime && (
                        <span className="tabular-nums">{session.loginTime.replace('T', ' ')}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Wifi className="size-3.5" aria-hidden="true" />
                {t('listInsights.online.empty')}
              </p>
            ))}
        </div>
      )}
    </section>
  )
}

export interface UserWorkspaceProps {
  controller?: DynaController
  collection: DynaTableProps
  filters: Readonly<Record<string, string>>
  applyFilters: (values: Record<string, string>) => void
  queryKey: readonly unknown[] | undefined
  selectedRowKey: string | null
  selectRow: (key: string | null) => void
  inspectorOpen: boolean
  onInspectorOpenChange: (open: boolean) => void
  search?: ReactNode
  intent?: EntityRouteIntent
  onAssignRoles?: (user: AssignRoleUserTarget) => void
  onResetPassword?: (user: ResetPasswordUserTarget) => void
}

export function UserWorkspace({
  controller,
  collection,
  filters,
  applyFilters,
  queryKey,
  selectedRowKey,
  selectRow,
  inspectorOpen,
  onInspectorOpenChange,
  search,
  intent,
  onAssignRoles,
  onResetPassword,
}: UserWorkspaceProps) {
  const { t } = useTranslation('system')
  const canOverview = useAuthStore(canAskAuthorizationQuestions)
  const canReadDept = useAuthStore((state) => state.hasPerm('system:dept:list'))
  const canReadDeptOptions = useAuthStore(
    (state) => state.hasPerm('system:user:add') || state.hasPerm('system:user:edit'),
  )
  const canViewOnline = useAuthStore((state) => state.hasPerm('system:online:list'))
  const canViewLoginLog = useAuthStore((state) => state.hasPerm('system:log:login'))
  const canEdit = useAuthStore((state) => state.hasPerm('system:user:edit'))
  const epoch = useAuthStore((state) => state.authorizationEpoch)

  const [rosterOpen, setRosterOpen] = useState(false)
  const [deptRailOpen, setDeptRailOpen] = useState(true)

  const overview = useQuery({
    queryKey: [...(queryKey ?? ['system', 'users', 'summary']), epoch, 'overview'],
    queryFn: ({ signal }) => getAuthorizationOverview(signal),
    enabled: canOverview,
  })

  const deptTreeQuery = useQuery<DeptTreeApiNode[]>({
    queryKey: ['system', 'users', 'dept-filter-tree', epoch, canReadDept],
    enabled: canReadDept || canReadDeptOptions,
    queryFn: ({ signal }) =>
      canReadDept
        ? request<DeptTreeApiNode[]>('/system/depts/tree', { signal })
        : request<DeptTreeApiNode[]>('/system/users/department-options', {
            query: { operation: 'CREATE' },
            signal,
          }),
  })

  const onlineQuery = useQuery({
    queryKey: ['system', 'online-users', 'user-workspace', epoch],
    queryFn: ({ signal }) => listOnlineUsers({ signal }),
    enabled: canViewOnline,
  })

  const activeDeptId = filters.deptId ?? ''
  const includeChildren = filters.includeChildren === 'true'
  const showDeptRail = (canReadDept || canReadDeptOptions) && deptRailOpen

  const selectDept = (deptId: string) => {
    const next = { ...filters }
    if (!deptId) {
      delete next.deptId
      delete next.includeChildren
    } else {
      next.deptId = deptId
      if (!next.includeChildren) next.includeChildren = 'true'
    }
    applyFilters(next)
  }

  const toggleIncludeChildren = (checked: boolean) => {
    const next = { ...filters }
    if (checked && activeDeptId) next.includeChildren = 'true'
    else delete next.includeChildren
    applyFilters(next)
  }

  const enrichedColumns = useMemo<DynaColumn[]>(() => {
    const base = [...collection.columns]
    const deptIndex = base.findIndex((col) => col.key === 'deptName')
    const roleCol: DynaColumn = {
      key: 'roles',
      title: '持有角色',
      render: (_val, row) => {
        const list = readUserRoles(row)
        if (list.length === 0) {
          return <span className="text-xs text-muted-foreground">未分配</span>
        }
        return (
          <div className="flex max-w-52 flex-wrap gap-1">
            {list.slice(0, 2).map((role) => (
              <Badge key={role.id} variant="secondary" className="text-[11px]">
                {role.roleName}
              </Badge>
            ))}
            {list.length > 2 && (
              <Badge variant="outline" className="font-mono text-[11px]">
                +{list.length - 2}
              </Badge>
            )}
          </div>
        )
      },
    }
    if (deptIndex >= 0) base.splice(deptIndex + 1, 0, roleCol)
    else base.push(roleCol)
    return base
  }, [collection.columns])

  const intentId = intent?.id
  const selectedRow = useMemo(() => {
    if (!collection.rows?.length) return null
    return (
      collection.rows.find(
        (row) =>
          value(row, collection.rowKey) === selectedRowKey ||
          (intentId && value(row, 'username') === intentId),
      ) ?? null
    )
  }, [collection.rowKey, collection.rows, intentId, selectedRowKey])

  const selectedUsername = selectedRow ? value(selectedRow, 'username') : ''
  const selectedSessions = useMemo(
    () => (onlineQuery.data ?? []).filter((session) => session.username === selectedUsername),
    [onlineQuery.data, selectedUsername],
  )

  const tableProps: DynaTableProps = {
    ...collection,
    columns: enrichedColumns,
    activeRowKey:
      inspectorOpen && selectedRow
        ? value(selectedRow, collection.rowKey)
        : collection.activeRowKey,
    onRowClick: (_row, key) => {
      selectRow(key)
      onInspectorOpenChange(true)
    },
  }

  const deptNodes = isResourceDenied(deptTreeQuery.error) ? [] : (deptTreeQuery.data ?? [])

  return (
    <div className="space-y-4">
      {intent?.source && <LivingContextBar source={intent.source} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-baseline gap-2" title={t('objectWorkspace.accountScope')}>
          <span className="text-2xl font-semibold tabular-nums">
            {collection.rows === undefined || collection.error ? (
              '—'
            ) : (
              <MetricValue value={collection.total} />
            )}
          </span>
          <span className="text-sm text-muted-foreground">
            {t('objectWorkspace.matchingAccounts')}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {(canReadDept || canReadDeptOptions) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden lg:inline-flex"
              aria-pressed={deptRailOpen}
              onClick={() => setDeptRailOpen((prev) => !prev)}
            >
              <FolderTree className="size-4" />
              {deptRailOpen ? '收起部门栏' : '展开部门栏'}
            </Button>
          )}
          {canOverview && overview.data?.usersVisible && !overview.isError && (
            <Button variant="secondary" size="sm" onClick={() => setRosterOpen(true)}>
              <ShieldCheck className="size-4" />
              {t('objectWorkspace.withoutRoles')}{' '}
              <span className="tabular-nums">{overview.data.usersWithoutRolesCount}</span>
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          'grid items-start gap-5',
          showDeptRail ? 'lg:grid-cols-[240px_minmax(0,1fr)]' : 'grid-cols-1',
        )}
      >
        {showDeptRail && (
          <aside
            aria-label="部门筛选"
            className="hidden rounded-panel border border-border-subtle bg-card p-3 shadow-surface lg:block"
          >
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-border-subtle pb-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <FolderTree className="size-3.5 text-brand-text" aria-hidden="true" />
                按部门筛选
              </span>
              {activeDeptId && (
                <button
                  type="button"
                  onClick={() => selectDept('')}
                  className="cursor-pointer text-[11px] text-brand-text hover:underline"
                >
                  全部
                </button>
              )}
            </div>

            <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              <button
                type="button"
                aria-pressed={!activeDeptId}
                onClick={() => selectDept('')}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-1.5 rounded-control px-2.5 py-1.5 text-left text-xs transition-colors',
                  !activeDeptId
                    ? 'bg-primary/14 font-semibold text-brand-text'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                <span>全部部门</span>
              </button>
              {deptNodes.length > 0 && (
                <DeptFilterTree
                  nodes={deptNodes}
                  selectedDeptId={activeDeptId}
                  onSelect={selectDept}
                />
              )}
            </div>

            {activeDeptId && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
                <Label htmlFor="user-include-children" className="text-xs text-muted-foreground">
                  含下级部门
                </Label>
                <Switch
                  id="user-include-children"
                  checked={includeChildren}
                  onCheckedChange={toggleIncludeChildren}
                />
              </div>
            )}
          </aside>
        )}

        <div className="min-w-0 space-y-4">
          {search}
          <DynaTable {...tableProps} />
        </div>
      </div>

      {/* 按需滑出账号上下文检视抽屉（含部门/角色/在线会话原位速览 + 直接分配角色/重置密码/编辑） */}
      <ResponsiveInspector
        mode="sheet"
        title={t('objectWorkspace.accountDetails')}
        open={inspectorOpen && selectedRow !== null}
        onOpenChange={onInspectorOpenChange}
      >
        {selectedRow && (
          <UserDossierContent
            selected={selectedRow}
            onlineSessions={selectedSessions}
            onlineError={onlineQuery.isError}
            canViewOnline={canViewOnline}
            canViewLoginLog={canViewLoginLog}
            canEdit={canEdit}
            onEdit={(row) => {
              onInspectorOpenChange(false)
              controller?.actions.openEdit(row)
            }}
            onAssignRoles={(user) => {
              onAssignRoles?.(user)
            }}
            onResetPassword={(user) => {
              onResetPassword?.(user)
            }}
          />
        )}
      </ResponsiveInspector>

      <Dialog open={rosterOpen} onOpenChange={setRosterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('objectWorkspace.unassignedTitle')}</DialogTitle>
            <DialogDescription>{t('objectWorkspace.withoutRolesHint')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {overview.isError ? (
              <p role="alert">
                {overview.error instanceof ApiError
                  ? overview.error.message
                  : t('listInsights.failed')}
              </p>
            ) : (
              overview.data?.usersWithoutRoles.map((user) => (
                <Button
                  key={user.id}
                  variant="outline"
                  className="w-full justify-between"
                  aria-label={t('objectWorkspace.locateAccount', {
                    name: user.nickname || user.username,
                  })}
                  onClick={() => {
                    applyFilters({ keyword: user.username })
                    selectRow(user.id)
                    onInspectorOpenChange(true)
                    setRosterOpen(false)
                  }}
                >
                  <span>{user.nickname || user.username}</span>
                  <span className="text-xs text-muted-foreground">{user.username}</span>
                  <ChevronRight className="size-4" />
                </Button>
              ))
            )}
            {overview.data?.usersWithoutRolesCount === 0 && (
              <p className="text-sm text-muted-foreground">{t('objectWorkspace.noUnassigned')}</p>
            )}
          </div>
          {overview.data && (
            <p className="text-xs text-muted-foreground">
              {t('objectWorkspace.rosterAt', { time: overview.data.evaluatedAt })}
              {overview.data.usersWithoutRoles.length < overview.data.usersWithoutRolesCount && (
                <span className="mt-1 block">
                  {t('objectWorkspace.unassignedLimit', {
                    shown: overview.data.usersWithoutRoles.length,
                    total: overview.data.usersWithoutRolesCount,
                  })}
                </span>
              )}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
