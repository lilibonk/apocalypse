/**
 * 权限目录空间工作台（V2 A3 主从档案台）：
 * 顶部紧凑模块胶囊轨（含 `__core__` 核心模块筛选）+ 左侧 StickyCompactRailLayout 资源/动作分组定位轨
 * + 右侧顶置 LivingContextBar 与单一连贯 L1 动作契约与持有角色档案面板。
 */
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Clock, Inbox, SearchX, ShieldCheck, Users, X } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DynaQueryFeedback, type DynaController, type DynaTableProps } from '@/components/dyna'
import { useDynaText } from '@/components/dyna/use-dyna'
import { MetricValue } from '@/components/motion'
import { EntityPill, LivingContextBar, type EntityRouteIntent } from '@/components/navigation'
import { StickyCompactRailLayout } from '@/components/spatial'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { insightMotion, motionGeometry, motionTransition, stateMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { isResourceDenied } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { getAuthorizationOverview, getPermissionHolders } from '../role/authorization-insight.api'
import { canAskAuthorizationQuestions } from '../role/authorization-questions.model'

const value = (row: Record<string, unknown>, key: string) =>
  row[key] == null ? '' : String(row[key])

export const CORE_MODULE_FILTER_VALUE = '__core__'

export interface PermissionWorkspaceProps {
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

export function PermissionWorkspace({
  controller,
  collection,
  filters,
  applyFilters,
  queryKey,
  selectedRowKey,
  selectRow,
  search,
  intent,
}: PermissionWorkspaceProps) {
  const { t } = useTranslation('system')
  const dynaText = useDynaText()
  const enabled = useMotionPreference()
  const layoutId = useId()
  const canOverview = useAuthStore(canAskAuthorizationQuestions)
  const epoch = useAuthStore((state) => state.authorizationEpoch)

  const overview = useQuery({
    queryKey: [...(queryKey ?? ['system', 'permissions', 'summary']), epoch, 'overview'],
    queryFn: ({ signal }) => getAuthorizationOverview(signal),
    enabled: canOverview,
  })

  const activeModule = filters.moduleKey ?? ''
  const activeResource = filters.resource ?? ''
  const modules = overview.isError ? [] : (overview.data?.permissionModules ?? [])

  const { rows, error, loading, refreshing, onRetry, filtered, onResetFilters } = collection
  const visible = rows !== undefined && !isResourceDenied(error)
  const totalPages = Math.max(1, Math.ceil(collection.total / collection.size))

  const selected =
    visible && rows.length > 0
      ? (rows.find(
          (row) =>
            value(row, collection.rowKey) === selectedRowKey ||
            (intent?.id && value(row, 'code') === intent.id) ||
            (intent?.focusTargetId && value(row, 'code') === intent.focusTargetId),
        ) ?? rows[0]!)
      : null
  const selectedId = selected ? value(selected, collection.rowKey) : ''

  const holdersQuery = useQuery({
    queryKey: ['system', 'permissions', 'holders', selectedId, epoch],
    queryFn: ({ signal }) => getPermissionHolders(selectedId, signal),
    enabled: canOverview && Boolean(selectedId),
  })

  return (
    <div className="space-y-4">
      {/* Top Bar: Single Matching Count + Compact Module Pill Rail */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {collection.rows === undefined || collection.error ? (
              '—'
            ) : (
              <MetricValue value={collection.total} />
            )}
          </span>
          <span className="text-sm text-muted-foreground">
            {t('objectWorkspace.matchingDefinitions')}
          </span>
        </p>

        {modules.length > 0 && (
          <div
            role="group"
            aria-label={t('objectWorkspace.modules')}
            className="flex flex-wrap items-center gap-2"
          >
            <Button
              size="sm"
              variant={!activeModule ? 'secondary' : 'outline'}
              aria-pressed={!activeModule}
              data-module-chip="all"
              onClick={() => applyFilters({ ...filters, moduleKey: '', resource: '' })}
            >
              {t('objectWorkspace.allModules')}
            </Button>
            {modules.map((module) => {
              const chipValue = module.key ?? CORE_MODULE_FILTER_VALUE
              const isCore = module.key === null
              const isPressed = activeModule === chipValue
              const label = isCore ? t('objectWorkspace.core') : module.key!

              return (
                <Button
                  key={chipValue}
                  size="sm"
                  variant={isPressed ? 'secondary' : 'outline'}
                  aria-pressed={isPressed}
                  data-module-chip={chipValue}
                  onClick={() =>
                    applyFilters({
                      ...filters,
                      moduleKey: isPressed ? '' : chipValue,
                      resource: '',
                    })
                  }
                >
                  <span>{label}</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {module.count}
                  </span>
                  {!isCore && !module.enabled && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {t('listInsights.permissions.moduleDisabled')}
                    </span>
                  )}
                </Button>
              )
            })}
          </div>
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
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-panel" />
          </div>
        ) : visible && rows.length > 0 && selected ? (
          (() => {
            const resources = new Map<string, Record<string, unknown>[]>()
            rows.forEach((row) => {
              const key = `${value(row, 'moduleKey')}:${value(row, 'resource')}`
              resources.set(key, [...(resources.get(key) ?? []), row])
            })
            const scopes = Array.isArray(selected.supportedScopeOverrides)
              ? selected.supportedScopeOverrides
              : []
            const rowActions =
              controller?.actions.renderRowActions(selected) ?? collection.actions?.(selected)
            const selectedCode = value(selected, 'code')
            const selectedName = value(selected, 'name') || selectedCode
            const selectedAction = value(selected, 'action')
            const isSensitiveAction =
              selected.sensitive === true ||
              ['remove', 'delete', 'reset', 'grant', 'revoke', 'kick', 'force'].some((token) =>
                selectedAction.toLowerCase().includes(token),
              )
            const sourceRef = {
              kind: 'permission' as const,
              id: selectedId,
              label: selectedName,
            }

            const holdingRoles = holdersQuery.data?.roles ?? []
            const uniqueMembers = Array.from(
              new Map(
                holdingRoles
                  .flatMap((role) => role.members)
                  .map((member) => [String(member.id), member]),
              ).values(),
            )

            return (
              <LayoutGroup id={layoutId}>
                <StickyCompactRailLayout
                  railLabel={t('objectWorkspace.resources')}
                  railWidth="locator"
                  railHeader={
                    activeResource ? (
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{t('objectWorkspace.pageResources')}</span>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-6 gap-1 px-2 text-xs"
                          onClick={() => applyFilters({ ...filters, resource: '' })}
                        >
                          <span>{activeResource}</span>
                          <X className="size-3" aria-hidden="true" />
                        </Button>
                      </div>
                    ) : undefined
                  }
                  railContent={
                    <div className="space-y-3">
                      {[...resources].map(([groupKey, actions]) => {
                        const resource = actions[0]!
                        const resourceName = value(resource, 'resource')
                        const moduleLabel =
                          value(resource, 'moduleKey') || t('objectWorkspace.core')
                        return (
                          <motion.section
                            key={groupKey}
                            layout={enabled ? 'position' : false}
                            transition={enabled ? stateMotion.yieldLayout : insightMotion.instant}
                            className="rounded-xl border border-border-subtle bg-card/80 p-3 shadow-xs"
                          >
                            <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="truncate">{moduleLabel}</span>
                              <ChevronRight className="size-3.5 shrink-0" />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto min-w-0 px-1 py-0 text-xs font-semibold text-foreground"
                                aria-label={t('objectWorkspace.resourceFilter', {
                                  name: resourceName,
                                })}
                                onClick={() =>
                                  applyFilters({
                                    ...filters,
                                    resource: activeResource === resourceName ? '' : resourceName,
                                  })
                                }
                              >
                                {resourceName || '—'}
                              </Button>
                              <span className="ml-auto font-mono text-[11px] tabular-nums">
                                {actions.length}
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              {actions.map((action) => {
                                const actionId = value(action, collection.rowKey)
                                const active = actionId === selectedId
                                return (
                                  <motion.button
                                    layout={enabled ? 'position' : false}
                                    transition={
                                      enabled ? motionTransition.standard : insightMotion.instant
                                    }
                                    key={actionId}
                                    type="button"
                                    aria-pressed={active}
                                    aria-label={t('objectWorkspace.selectAction', {
                                      name: value(action, 'name'),
                                    })}
                                    onClick={() => selectRow(actionId)}
                                    data-selected={active}
                                    className={cn(
                                      'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                                      active
                                        ? 'border-primary/40 bg-primary/8 text-foreground shadow-xs'
                                        : 'border-border-subtle/70 bg-background/60 hover:border-border hover:bg-muted/40',
                                    )}
                                  >
                                    <ShieldCheck
                                      className={cn(
                                        'size-4 shrink-0',
                                        active ? 'text-primary' : 'text-muted-foreground',
                                      )}
                                      aria-hidden="true"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-semibold">
                                        {value(action, 'name')}
                                      </p>
                                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                                        {value(action, 'code')}
                                      </p>
                                    </div>
                                    <Badge
                                      variant={
                                        Number(action.status) === 1 ? 'success' : 'secondary'
                                      }
                                    >
                                      {t(
                                        Number(action.status) === 1
                                          ? 'authorization.active'
                                          : 'authorization.inactive',
                                      )}
                                    </Badge>
                                  </motion.button>
                                )
                              })}
                            </div>
                          </motion.section>
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
                    key={`${selectedId}:${value(selected, 'version')}`}
                    initial={
                      enabled
                        ? { opacity: stateMotion.dimOpacity, y: motionGeometry.pageOffset }
                        : false
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={enabled ? motionTransition.standard : insightMotion.instant}
                    role="complementary"
                    aria-label={t('objectWorkspace.definitionDetails')}
                    className="divide-y divide-border-subtle rounded-panel border border-border-subtle bg-card p-5 shadow-surface"
                  >
                    {/* 第一区：顶置 LivingContextBar + 动作契约头 */}
                    <div className="space-y-3.5 pb-4">
                      <LivingContextBar source={intent?.source}>
                        {holdingRoles.map((role) => (
                          <EntityPill
                            key={`role-${role.roleId}`}
                            kind="role"
                            id={String(role.roleId)}
                            label={role.roleName}
                            sublabel={role.roleKey}
                            relation="permissions"
                            focusTargetId={selectedCode || selectedId}
                            size="sm"
                            source={sourceRef}
                          />
                        ))}
                        {uniqueMembers.map((member) => (
                          <EntityPill
                            key={`user-${member.id}`}
                            kind="user"
                            id={String(member.id)}
                            label={member.nickname || member.username}
                            sublabel={member.username}
                            size="sm"
                            source={sourceRef}
                          />
                        ))}
                      </LivingContextBar>

                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="break-words text-xl font-semibold text-foreground">
                              {value(selected, 'name')}
                            </h2>
                            <Badge
                              variant={Number(selected.status) === 1 ? 'success' : 'secondary'}
                            >
                              {t(
                                Number(selected.status) === 1
                                  ? 'authorization.active'
                                  : 'authorization.inactive',
                              )}
                            </Badge>
                            {isSensitiveAction && (
                              <Badge variant="outline" className="text-warning-foreground">
                                {selectedAction}
                              </Badge>
                            )}
                            <Badge variant="secondary">
                              {t(`authorization.${value(selected, 'lifecycle')}`)}
                            </Badge>
                            <Badge variant="outline">
                              {t(
                                selected.registered
                                  ? 'objectWorkspace.registered'
                                  : 'objectWorkspace.historical',
                              )}
                            </Badge>
                          </div>
                          <div>
                            <code className="font-mono text-xs text-muted-foreground">
                              {selectedCode}
                            </code>
                          </div>
                        </div>

                        {rowActions && (
                          <div className="flex flex-wrap items-center gap-1">{rowActions}</div>
                        )}
                      </div>

                      <p className="break-words text-sm leading-relaxed text-muted-foreground">
                        {value(selected, 'description') || t('objectWorkspace.noDescription')}
                      </p>
                    </div>

                    {/* 第二区：模块状态与数据范围支持契约（无边框清爽键值排版） */}
                    <div className="py-4">
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.modules')}
                          </dt>
                          <dd className="mt-0.5 font-medium text-foreground">
                            {value(selected, 'moduleKey') || t('objectWorkspace.core')}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.moduleStatus')}
                          </dt>
                          <dd className="mt-0.5 font-medium text-foreground">
                            {holdersQuery.data
                              ? holdersQuery.data.moduleEnabled
                                ? t('authorization.active')
                                : t('listInsights.permissions.moduleDisabled')
                              : t(
                                  Number(selected.status) === 1
                                    ? 'authorization.active'
                                    : 'authorization.inactive',
                                )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.references')} / {t('objectWorkspace.version')}
                          </dt>
                          <dd className="mt-0.5 font-mono font-semibold tabular-nums">
                            {value(selected, 'referenceRoleCount') || '0'} · v
                            {value(selected, 'version') || '0'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.supportedScopes')}
                          </dt>
                          <dd className="mt-0.5 text-xs leading-relaxed text-foreground">
                            {scopes.length
                              ? scopes
                                  .map((scope) => t(`authorization.${String(scope)}`))
                                  .join(' · ')
                              : t('objectWorkspace.noScopes')}
                          </dd>
                        </div>
                        <div className="sm:col-span-4">
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.declaration')}
                          </dt>
                          <dd className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                            {value(selected, 'declarationSource') || '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* 第三区：持有角色与生效范围纯文本明细表（零行内胶囊） */}
                    {canOverview && (
                      <div className="space-y-3 pt-4" data-testid="permission-holders-stage">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Users className="size-4 text-violet-600 dark:text-violet-400" />
                            <h3 className="text-sm font-semibold text-foreground">
                              {t('commandQa.q.holders')}
                            </h3>
                          </div>
                          {holdersQuery.data && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {t('commandQa.holdersSummary', {
                                total: holdersQuery.data.roles.length,
                                active: holdersQuery.data.activeRoleCount,
                                users: holdersQuery.data.coveredVisibleUserCount,
                              })}
                            </span>
                          )}
                        </div>

                        {holdersQuery.isLoading ? (
                          <p className="text-xs text-muted-foreground">{t('commandQa.querying')}</p>
                        ) : holdersQuery.isError ? (
                          <div className="flex items-center justify-between gap-2 text-xs text-destructive">
                            <span>{t('commandQa.failed')}</span>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => void holdersQuery.refetch()}
                            >
                              {t('commandQa.retry')}
                            </Button>
                          </div>
                        ) : holdersQuery.data ? (
                          holdersQuery.data.roles.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {t('commandQa.noHolders')}
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-border-subtle text-muted-foreground">
                                    <th className="py-2 pr-3 font-medium">
                                      {t('objectWorkspace.references')}
                                    </th>
                                    <th className="py-2 pr-3 font-medium">
                                      {t('objectWorkspace.defaultScope')}
                                    </th>
                                    <th className="py-2 pr-3 font-medium">
                                      {t('objectWorkspace.overrideScope')}
                                    </th>
                                    <th className="py-2 font-medium">
                                      {t('objectWorkspace.validityStatus')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle/60">
                                  {holdersQuery.data.roles.map((role) => (
                                    <tr key={role.roleId}>
                                      <td className="py-2.5 pr-3">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="font-medium text-foreground">
                                            {role.roleName}
                                          </span>
                                          <code className="font-mono text-[11px] text-muted-foreground">
                                            {role.roleKey}
                                          </code>
                                        </div>
                                      </td>
                                      <td className="py-2.5 pr-3 text-muted-foreground">
                                        {role.roleDataScope
                                          ? t(`authorization.${role.roleDataScope}`, {
                                              defaultValue: role.roleDataScope,
                                            })
                                          : '—'}
                                      </td>
                                      <td className="py-2.5 pr-3">
                                        {role.effectiveScope
                                          ? t(`authorization.${role.effectiveScope}`, {
                                              defaultValue: role.effectiveScope,
                                            })
                                          : '—'}
                                      </td>
                                      <td className="py-2.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge
                                            variant={
                                              role.state === 'ACTIVE' ? 'success' : 'secondary'
                                            }
                                          >
                                            {t(`commandQa.state.${role.state}`, {
                                              defaultValue: role.state,
                                            })}
                                          </Badge>
                                          {(role.validFrom || role.validUntil) && (
                                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground tabular-nums">
                                              <Clock className="size-3" aria-hidden="true" />
                                              {t('commandQa.window', {
                                                from: role.validFrom?.replace('T', ' ') ?? '∞',
                                                until: role.validUntil?.replace('T', ' ') ?? '∞',
                                              })}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        ) : null}
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
    </div>
  )
}
