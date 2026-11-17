/**
 * 权限目录空间工作台（V2 A3 主从档案台）：
 * 顶部紧凑模块胶囊轨（含 `__core__` 核心模块筛选）+ 左侧 StickyCompactRailLayout 资源/动作分组定位轨
 * + 右侧顶置 LivingContextBar 与单一连贯 L1 动作契约与持有角色档案面板。
 */
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Clock, Inbox, KeyRound, SearchX, ShieldCheck, Users, X } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useId, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DynaQueryFeedback, type DynaController, type DynaTableProps } from '@/components/dyna'
import { useDynaText } from '@/components/dyna/use-dyna'
import { FluidConduitOverlay, MetricValue, SketchBox, type ConduitLink } from '@/components/motion'
import { EntityPeekLink, LivingContextBar, type EntityRouteIntent } from '@/components/navigation'
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
  const holdersStageRef = useRef<HTMLDivElement>(null)
  const holderConduitLinks = useMemo<ConduitLink[]>(() => {
    const roles = (holdersQuery.data?.roles ?? []).slice(0, 6)
    const links: ConduitLink[] = []
    for (const role of roles) {
      const active = role.state === 'ACTIVE'
      links.push({
        id: `perm-fanout-${role.roleId}`,
        from: 'perm-selected',
        to: `perm-role-${role.roleId}`,
        enabled: active,
        scope: role.effectiveScope === 'ALL' ? 'ALL' : 'STANDARD',
      })
      for (const member of role.members.slice(0, 4)) {
        links.push({
          id: `perm-role-user-${role.roleId}-${member.id}`,
          from: `perm-role-${role.roleId}`,
          to: `perm-member-${member.id}`,
          enabled: active,
          scope: role.effectiveScope === 'ALL' ? 'ALL' : 'STANDARD',
        })
      }
    }
    return links
  }, [holdersQuery.data?.roles])

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
                    className="sketch-surface divide-y divide-border-subtle rounded-panel border border-border-subtle bg-card p-5 shadow-surface"
                  >
                    {/* 第一区与第二区合并为紧凑 Action Contract 档案卡头 */}
                    <div className="space-y-3 pb-4">
                      {intent?.source && <LivingContextBar source={intent.source} />}

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
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <code className="font-mono text-foreground">{selectedCode}</code>
                            <span>·</span>
                            <span>{value(selected, 'moduleKey') || t('objectWorkspace.core')}</span>
                            <span>·</span>
                            <span className="font-mono tabular-nums">
                              {value(selected, 'referenceRoleCount') || '0'}{' '}
                              {t('objectWorkspace.references')} · v
                              {value(selected, 'version') || '0'}
                            </span>
                          </div>
                        </div>

                        {rowActions && (
                          <div className="flex flex-wrap items-center gap-1">{rowActions}</div>
                        )}
                      </div>

                      <p className="break-words text-sm leading-relaxed text-muted-foreground">
                        {value(selected, 'description') || t('objectWorkspace.noDescription')}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-control bg-muted/40 px-3 py-2 text-xs">
                        <span className="text-muted-foreground">
                          <strong className="font-medium text-foreground">
                            {t('objectWorkspace.supportedScopes')}:
                          </strong>{' '}
                          {scopes.length
                            ? scopes.map((scope) => t(`authorization.${String(scope)}`)).join(' · ')
                            : t('objectWorkspace.noScopes')}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          <strong className="font-sans font-medium text-foreground">
                            {t('objectWorkspace.declaration')}:
                          </strong>{' '}
                          {value(selected, 'declarationSource') || '—'}
                        </span>
                      </div>
                    </div>

                    {/* 第三区：CT-03 3列 SVG 扇出穿透舞台（Action Contract -> Holding Roles -> Covered Users） */}
                    {canOverview && (
                      <div
                        ref={holdersStageRef}
                        className="relative space-y-3 pt-4"
                        data-testid="permission-holders-stage"
                      >
                        <FluidConduitOverlay
                          containerRef={holdersStageRef}
                          links={holderConduitLinks}
                          flow="horizontal"
                          minContainerWidth={560}
                          pulseKey={selectedId}
                        />
                        <div className="relative z-[2] flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Users className="size-4 text-brand-text" aria-hidden="true" />
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
                          <p className="relative z-[2] text-xs text-muted-foreground">
                            {t('commandQa.querying')}
                          </p>
                        ) : holdersQuery.isError ? (
                          <div className="relative z-[2] flex items-center justify-between gap-2 text-xs text-destructive">
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
                          holdingRoles.length === 0 ? (
                            <p className="relative z-[2] text-xs text-muted-foreground">
                              {t('commandQa.noHolders')}
                            </p>
                          ) : (
                            <div className="relative z-[2] grid items-center gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-11">
                              {/* Col 1: Action Contract Anchor Node */}
                              <div>
                                <SketchBox
                                  seed={37}
                                  wash="normal"
                                  data-conduit-anchor="perm-selected"
                                  className="p-3.5"
                                >
                                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/14 text-brand-text">
                                      <KeyRound className="size-3.5" aria-hidden="true" />
                                    </span>
                                    <span className="truncate">{value(selected, 'name')}</span>
                                  </div>
                                  <code className="mt-1.5 block truncate font-mono text-xs text-muted-foreground">
                                    {selectedCode}
                                  </code>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {holdersQuery.data.moduleEnabled
                                      ? t('authorization.active')
                                      : t('listInsights.permissions.moduleDisabled')}
                                  </p>
                                </SketchBox>
                              </div>

                              {/* Col 2: Holding Roles */}
                              <div className="space-y-2.5">
                                {holdingRoles.map((role, index) => (
                                  <SketchBox
                                    key={role.roleId}
                                    seed={role.roleId.length * 13 + index}
                                    wash={role.state === 'ACTIVE' ? 'none' : 'wide'}
                                    data-conduit-anchor={
                                      index < 6 ? `perm-role-${role.roleId}` : undefined
                                    }
                                    className="p-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <ShieldCheck
                                          className="size-3.5 shrink-0 text-brand-text"
                                          aria-hidden="true"
                                        />
                                        <EntityPeekLink
                                          kind="role"
                                          id={String(role.roleId)}
                                          label={role.roleName}
                                          sublabel={role.roleKey}
                                          relation="permissions"
                                          focusTargetId={selectedCode || selectedId}
                                          source={sourceRef}
                                        />
                                      </div>
                                      <Badge
                                        variant={role.state === 'ACTIVE' ? 'success' : 'secondary'}
                                      >
                                        {t(`commandQa.state.${role.state}`, {
                                          defaultValue: role.state,
                                        })}
                                      </Badge>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                      <code className="font-mono text-[11px]">{role.roleKey}</code>
                                      <span>
                                        {role.effectiveScope
                                          ? t(`authorization.${role.effectiveScope}`, {
                                              defaultValue: role.effectiveScope,
                                            })
                                          : '—'}
                                      </span>
                                      {(role.validFrom || role.validUntil) && (
                                        <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums">
                                          <Clock className="size-3" aria-hidden="true" />
                                          {t('commandQa.window', {
                                            from: role.validFrom?.replace('T', ' ') ?? '∞',
                                            until: role.validUntil?.replace('T', ' ') ?? '∞',
                                          })}
                                        </span>
                                      )}
                                    </div>
                                  </SketchBox>
                                ))}
                              </div>

                              {/* Col 3: Covered Visible Users */}
                              <div className="space-y-2">
                                {(() => {
                                  const uniqueMembers = Array.from(
                                    new Map(
                                      holdingRoles
                                        .flatMap((r) => r.members)
                                        .map((m) => [String(m.id), m]),
                                    ).values(),
                                  ).slice(0, 8)
                                  if (!uniqueMembers.length) {
                                    return (
                                      <p className="rounded-control border border-dashed border-border-subtle p-3 text-xs text-muted-foreground">
                                        {holdersQuery.data.membersVisible
                                          ? t('commandQa.noHolders')
                                          : t('commandQa.membersHidden')}
                                      </p>
                                    )
                                  }
                                  return uniqueMembers.map((member) => (
                                    <div
                                      key={member.id}
                                      data-conduit-anchor={`perm-member-${member.id}`}
                                      className="flex items-center gap-2.5 rounded-panel border border-border-subtle bg-card/90 px-3 py-2 shadow-xs"
                                    >
                                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/14 text-xs font-semibold text-brand-text">
                                        {(member.nickname || member.username)
                                          .slice(0, 1)
                                          .toUpperCase()}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <EntityPeekLink
                                          kind="user"
                                          id={String(member.id)}
                                          label={member.nickname || member.username}
                                          sublabel={member.username}
                                          source={sourceRef}
                                          className="text-xs font-medium"
                                        />
                                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                                          @{member.username}
                                        </p>
                                      </div>
                                    </div>
                                  ))
                                })()}
                              </div>
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
