/**
 * 用户空间工作台（V2 A3 主从档案台）：
 * 左侧 StickyCompactRailLayout 单列紧凑账号定位轨 + 右侧顶置 LivingContextBar 与单一连贯 L1 身份与权责档案面板。
 */
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Building2,
  ChevronRight,
  CircleUserRound,
  Inbox,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Wifi,
} from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { DictTag } from '@/components/DictTag'
import { DynaQueryFeedback, type DynaController, type DynaTableProps } from '@/components/dyna'
import { useDynaText } from '@/components/dyna/use-dyna'
import { MetricValue, PulseIndicator } from '@/components/motion'
import { EntityPill, LivingContextBar, type EntityRouteIntent } from '@/components/navigation'
import { StickyCompactRailLayout } from '@/components/spatial'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { insightMotion, motionGeometry, motionTransition, stateMotion } from '@/design/motion'
import { useMenuRoute } from '@/hooks/useMenuRoute'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { ApiError } from '@/lib/api/client'
import type { DeptPathNode, UserRoleSummary } from '@/lib/api/types'
import { isResourceDenied } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { listOnlineUsers } from '../online/online.api'
import { getAuthorizationOverview } from '../role/authorization-insight.api'
import { canAskAuthorizationQuestions } from '../role/authorization-questions.model'

const value = (row: Record<string, unknown>, key: string) =>
  row[key] == null ? '' : String(row[key])

function readDeptPath(row: Record<string, unknown>): DeptPathNode[] {
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

function readUserRoles(row: Record<string, unknown>): UserRoleSummary[] {
  if (!Array.isArray(row.roles)) return []
  return row.roles.filter((item): item is UserRoleSummary =>
    Boolean(item && typeof item === 'object' && 'id' in item && 'roleName' in item),
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
  search?: ReactNode
  intent?: EntityRouteIntent
}

export function UserWorkspace({
  controller,
  collection,
  applyFilters,
  queryKey,
  selectedRowKey,
  selectRow,
  search,
  intent,
}: UserWorkspaceProps) {
  const { t } = useTranslation('system')
  const dynaText = useDynaText()
  const motionEnabled = useMotionPreference()
  const layoutId = useId()
  const canOverview = useAuthStore(canAskAuthorizationQuestions)
  const canViewOnline = useAuthStore((state) => state.hasPerm('system:online:list'))
  const canViewLoginLog = useAuthStore((state) => state.hasPerm('system:log:login'))
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const roleRoute = useMenuRoute('system/role')
  const [rosterOpen, setRosterOpen] = useState(false)

  const overview = useQuery({
    queryKey: [...(queryKey ?? ['system', 'users', 'summary']), epoch, 'overview'],
    queryFn: ({ signal }) => getAuthorizationOverview(signal),
    enabled: canOverview,
  })

  const onlineQuery = useQuery({
    queryKey: ['system', 'online-users', 'user-workspace', epoch],
    queryFn: ({ signal }) => listOnlineUsers({ signal }),
    enabled: canViewOnline,
  })

  const { rows, error, loading, refreshing, onRetry, filtered, onResetFilters } = collection
  const visible = rows !== undefined && !isResourceDenied(error)
  const totalPages = Math.max(1, Math.ceil(collection.total / collection.size))

  return (
    <div className="space-y-4">
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
        {canOverview && overview.data?.usersVisible && !overview.isError && (
          <Button variant="secondary" size="sm" onClick={() => setRosterOpen(true)}>
            <ShieldCheck className="size-4" />
            {t('objectWorkspace.withoutRoles')}{' '}
            <span className="tabular-nums">{overview.data.usersWithoutRolesCount}</span>
          </Button>
        )}
      </div>

      {search}

      <div className="space-y-4" aria-busy={loading || refreshing}>
        <DynaQueryFeedback
          error={error}
          hasData={visible}
          refreshing={refreshing}
          onRetry={onRetry}
        />

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="space-y-2.5">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-panel" />
          </div>
        ) : visible && rows.length > 0 ? (
          (() => {
            const selected =
              rows.find(
                (row) =>
                  value(row, collection.rowKey) === selectedRowKey ||
                  (intent?.id && value(row, 'username') === intent.id),
              ) ?? rows[0]!
            const selectedId = value(selected, collection.rowKey)
            const username = value(selected, 'username')
            const name = value(selected, 'nickname') || username
            const deptPath = readDeptPath(selected)
            const deptFullText =
              deptPath.length > 0
                ? deptPath.map((d) => d.deptName).join(' / ')
                : t('objectWorkspace.unspecified')
            const roles = readUserRoles(selected)
            const userSessions = (onlineQuery.data ?? []).filter(
              (session) => session.username === username,
            )
            const rowActions =
              controller?.actions.renderRowActions(selected) ?? collection.actions?.(selected)
            const sourceRef = { kind: 'user' as const, id: selectedId, label: name }

            return (
              <LayoutGroup id={layoutId}>
                <StickyCompactRailLayout
                  railLabel={t('objectWorkspace.account')}
                  railWidth="locator"
                  railContent={
                    <div
                      className="space-y-2"
                      role="list"
                      aria-label={t('objectWorkspace.account')}
                    >
                      {rows.map((row) => {
                        const id = value(row, collection.rowKey)
                        const active = id === selectedId
                        const rowUsername = value(row, 'username')
                        const label = value(row, 'nickname') || rowUsername
                        const rowRoles = readUserRoles(row)
                        const rowDept =
                          readDeptPath(row).at(-1)?.deptName ||
                          value(row, 'deptName') ||
                          t('objectWorkspace.unspecified')

                        return (
                          <motion.article
                            key={id}
                            role="listitem"
                            layout={motionEnabled ? 'position' : false}
                            transition={
                              motionEnabled ? stateMotion.yieldLayout : insightMotion.instant
                            }
                            data-selected={active}
                            className={cn(
                              'rounded-xl border transition-colors',
                              active
                                ? 'border-primary/40 bg-primary/8 shadow-xs'
                                : 'border-border-subtle bg-card/80 hover:border-border hover:bg-muted/40',
                            )}
                          >
                            <button
                              type="button"
                              className="w-full rounded-xl p-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              aria-pressed={active}
                              aria-label={t('objectWorkspace.selectAccount', { name: label })}
                              onClick={() => selectRow(id)}
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span
                                  className={cn(
                                    'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-colors',
                                    active
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted text-muted-foreground',
                                  )}
                                  aria-hidden="true"
                                >
                                  {label.slice(0, 1)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-foreground">
                                    {label}
                                  </p>
                                  <p className="truncate font-mono text-xs text-muted-foreground">
                                    @{rowUsername}
                                  </p>
                                </div>
                                <DictTag type="sys_user_status" value={String(row.status)} />
                              </div>
                              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border-subtle/60 pt-2 text-xs text-muted-foreground">
                                <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                                  <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                                  <span className="truncate">{rowDept}</span>
                                </span>
                                {rowRoles.length > 0 && (
                                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] tabular-nums">
                                    {rowRoles.length}
                                  </span>
                                )}
                              </div>
                            </button>
                          </motion.article>
                        )
                      })}
                    </div>
                  }
                  railFooter={
                    <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={collection.page <= 1}
                        onClick={() => collection.onPageChange(collection.page - 1)}
                      >
                        {dynaText('上一页')}
                      </Button>
                      <span className="font-mono tabular-nums">
                        {collection.page} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={collection.page >= totalPages}
                        onClick={() => collection.onPageChange(collection.page + 1)}
                      >
                        {dynaText('下一页')}
                      </Button>
                    </div>
                  }
                >
                  <motion.section
                    key={`${selectedId}:${value(selected, 'deptId')}:${value(selected, 'status')}`}
                    initial={
                      motionEnabled
                        ? { opacity: stateMotion.dimOpacity, y: motionGeometry.pageOffset }
                        : false
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={motionEnabled ? motionTransition.standard : insightMotion.instant}
                    role="region"
                    aria-label={t('objectWorkspace.accountDetails')}
                    className="divide-y divide-border-subtle rounded-panel border border-border-subtle bg-card p-5 shadow-surface"
                  >
                    {/* 第一区：黄金视线顶栏 + 顶置 LivingContextBar */}
                    <div className="space-y-3.5 pb-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <span
                            className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-lg font-semibold text-primary"
                            aria-hidden="true"
                          >
                            {name.slice(0, 1)}
                          </span>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="break-words text-xl font-semibold text-foreground">
                                {name}
                              </h2>
                              <DictTag type="sys_user_status" value={String(selected.status)} />
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 font-mono">
                                <CircleUserRound className="size-3.5" aria-hidden="true" />@
                                {username}
                              </span>
                            </div>
                          </div>
                        </div>
                        {rowActions && (
                          <div className="flex flex-wrap items-center gap-1.5">{rowActions}</div>
                        )}
                      </div>

                      <LivingContextBar source={intent?.source}>
                        {deptPath.map((node) => (
                          <EntityPill
                            key={`dept-${node.id}`}
                            kind="dept"
                            id={String(node.id)}
                            label={node.deptName}
                            size="sm"
                            source={sourceRef}
                          />
                        ))}
                        {roles.map((role) => (
                          <EntityPill
                            key={`role-${role.id}`}
                            kind="role"
                            id={String(role.id)}
                            label={role.roleName}
                            sublabel={role.roleKey}
                            relation="members"
                            focusTargetId={selectedId}
                            size="sm"
                            source={sourceRef}
                          />
                        ))}
                        {canViewOnline &&
                          userSessions.map((session) => (
                            <EntityPill
                              key={`session-${session.jti}`}
                              kind="session"
                              id={session.username}
                              label={session.username}
                              sublabel={session.ip ?? undefined}
                              size="sm"
                              source={sourceRef}
                            />
                          ))}
                        {canViewLoginLog && (
                          <EntityPill
                            key={`log-login-${username}`}
                            kind="log-login"
                            id={username}
                            label={t('objectWorkspace.loginActivity')}
                            size="sm"
                            source={sourceRef}
                          />
                        )}
                      </LivingContextBar>
                    </div>

                    {/* 第二区：基础与组织档案（纯文本双列键值排版，零胶囊） */}
                    <div className="py-4" data-testid="user-dept-chain">
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.username')}
                          </dt>
                          <dd className="mt-0.5 font-mono text-foreground">{username || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.nickname')}
                          </dt>
                          <dd className="mt-0.5 font-medium text-foreground">
                            {value(selected, 'nickname') || '—'}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.department')}
                          </dt>
                          <dd className="mt-0.5 font-medium text-foreground">{deptFullText}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.email')}
                          </dt>
                          <dd className="mt-0.5 break-all text-foreground">
                            {value(selected, 'email') || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.phone')}
                          </dt>
                          <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                            {value(selected, 'phone') || value(selected, 'phonenumber') || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.created')}
                          </dt>
                          <dd className="mt-0.5 tabular-nums text-foreground">
                            {value(selected, 'createTime').replace('T', ' ') || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.remark')}
                          </dt>
                          <dd className="mt-0.5 break-words text-foreground">
                            {value(selected, 'remark') || '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* 第三区：生效角色与数据范围（无边框清爽列表，零胶囊） */}
                    <div className="space-y-3 py-4" data-testid="user-roles-stage">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <ShieldCheck className="size-4 text-amber-600 dark:text-amber-400" />
                          <span>{t('authorization.members')}</span>
                          <Badge variant="secondary" className="font-mono tabular-nums">
                            {roles.length}
                          </Badge>
                        </div>
                        {roleRoute && (
                          <Button asChild variant="outline" size="sm">
                            <Link
                              to={`${roleRoute}?roleRelation=members&focus=${encodeURIComponent(selectedId)}`}
                              state={{
                                entityIntent: {
                                  kind: 'role',
                                  id: roles[0]?.id ? String(roles[0].id) : selectedId,
                                  label: username,
                                  relation: 'members',
                                  focusTargetId: selectedId,
                                  triggerPulse: true,
                                  source: sourceRef,
                                },
                              }}
                            >
                              <ShieldCheck className="size-4" />
                              {t('objectWorkspace.manageRoles')}
                            </Link>
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
                                <span className="truncate font-medium text-foreground">
                                  {role.roleName}
                                </span>
                                <code className="font-mono text-xs text-muted-foreground">
                                  {role.roleKey}
                                </code>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge
                                  variant={Number(role.status) === 1 ? 'success' : 'secondary'}
                                >
                                  {t(
                                    Number(role.status) === 1
                                      ? 'authorization.active'
                                      : 'authorization.inactive',
                                  )}
                                </Badge>
                                {role.dataScope && (
                                  <Badge variant="outline">
                                    {t(`dataScope.${role.dataScope}`, {
                                      defaultValue: role.dataScope,
                                    })}
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

                    {/* 第四区：实时活跃状态（纯文本设备摘要或离线状态） */}
                    {(canViewOnline || canViewLoginLog) && (
                      <div className="space-y-2.5 pt-4" data-testid="user-sessions-stage">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Activity className="size-4 text-cyan-600 dark:text-cyan-400" />
                            <span>{t('objectWorkspace.online')}</span>
                            {canViewOnline && !onlineQuery.isError && (
                              <span className="inline-flex items-center gap-1.5">
                                {userSessions.length > 0 && <PulseIndicator tone="brand" />}
                                <Badge variant="secondary" className="font-mono tabular-nums">
                                  {userSessions.length}
                                </Badge>
                              </span>
                            )}
                          </div>
                        </div>

                        {canViewOnline &&
                          (userSessions.length > 0 ? (
                            <ul className="divide-y divide-border-subtle/60 text-xs">
                              {userSessions.map((session) => (
                                <li
                                  key={session.jti}
                                  className="flex flex-wrap items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
                                >
                                  <span className="font-medium text-foreground">
                                    {session.userAgent || session.username}
                                  </span>
                                  <div className="flex items-center gap-3 text-muted-foreground">
                                    <span className="font-mono">{session.ip || '—'}</span>
                                    {session.loginTime && (
                                      <span className="tabular-nums">
                                        {session.loginTime.replace('T', ' ')}
                                      </span>
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
                  </motion.section>
                </StickyCompactRailLayout>
              </LayoutGroup>
            )
          })()
        ) : (
          (visible || !error) && (
            <>
              {intent?.source && <LivingContextBar source={intent.source} />}
              <div
                role="status"
                className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-panel border border-border-subtle bg-card p-6 text-center text-muted-foreground"
              >
                {filtered ? (
                  <SearchX className="size-6" aria-hidden="true" />
                ) : (
                  <Inbox className="size-6" aria-hidden="true" />
                )}
                <p className="font-medium text-foreground">
                  {dynaText(filtered ? 'queryNoMatches' : '暂无数据')}
                </p>
                <p className="text-sm">
                  {dynaText(filtered ? 'queryNoMatchesHint' : 'queryEmptyHint')}
                </p>
                {filtered && onResetFilters && (
                  <Button variant="outline" size="sm" onClick={onResetFilters}>
                    {dynaText('queryClearFilters')}
                  </Button>
                )}
              </div>
            </>
          )
        )}
      </div>

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
