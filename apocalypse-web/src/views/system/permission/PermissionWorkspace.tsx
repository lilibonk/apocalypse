/**
 * 权限清单工作台：
 * - 顶部总数 + 模块过滤胶囊（含 `__core__` 核心模块筛选）
 * - 统一 DynaSearch 与高可读权限清单表格（支持数据范围、状态、引用角色查看）
 * - 点击“引用角色数”弹窗轻量查看持有角色与授权窗口，去除 3 列 SVG 扇出图与跳页迷宫
 */
import { useQuery } from '@tanstack/react-query'
import { Clock, Eye, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DynaTable,
  type DynaColumn,
  type DynaController,
  type DynaTableProps,
} from '@/components/dyna'
import { MetricValue } from '@/components/motion'
import { LivingContextBar, type EntityRouteIntent } from '@/components/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ApiError } from '@/lib/api/client'
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
  onOpenDetails?: (row: Record<string, unknown>) => void
  search?: ReactNode
  intent?: EntityRouteIntent
}

function isLegacyPermissionRow(row: Record<string, unknown>): boolean {
  return row.registered !== true || row.lifecycle === 'LEGACY'
}

export function PermissionWorkspace({
  controller,
  collection,
  filters,
  applyFilters,
  queryKey,
  selectedRowKey,
  selectRow,
  onOpenDetails,
  search,
  intent,
}: PermissionWorkspaceProps) {
  const { t } = useTranslation('system')
  const canOverview = useAuthStore(canAskAuthorizationQuestions)
  const perms = useAuthStore((state) => state.perms)
  const allScopePerms = useAuthStore((state) => state.allScopePerms)
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const [inspectRow, setInspectRow] = useState<Record<string, unknown> | null>(null)
  const hasListPerm = perms.includes('system:permission:list')
  const hasEditPerm = perms.includes('system:permission:edit')
  const hasAllEditScope = allScopePerms.includes('system:permission:edit')

  const overview = useQuery({
    queryKey: [...(queryKey ?? ['system', 'permissions', 'summary']), epoch, 'overview'],
    queryFn: ({ signal }) => getAuthorizationOverview(signal),
    enabled: canOverview,
  })

  const activeModule = filters.moduleKey ?? ''
  const modules = overview.isError ? [] : (overview.data?.permissionModules ?? [])

  const inspectId = inspectRow ? value(inspectRow, collection.rowKey) : ''
  const holdersQuery = useQuery({
    queryKey: ['system', 'permissions', 'holders', inspectId, epoch],
    queryFn: ({ signal }) => getPermissionHolders(inspectId, signal),
    enabled: canOverview && Boolean(inspectId),
  })

  const enhancedColumns = useMemo<DynaColumn[]>(() => {
    const baseColumns: DynaColumn[] = []
    for (const column of collection.columns) {
      if (column.key === 'resource' || column.key === 'action') continue
      if (column.key === 'moduleKey') {
        baseColumns.push({
          ...column,
          title: t('objectWorkspace.modules', { defaultValue: '所属模块' }),
          render: (val) => (
            <span className="font-mono text-xs text-muted-foreground">
              {val ? String(val) : t('objectWorkspace.core')}
            </span>
          ),
        })
        continue
      }
      baseColumns.push(column)
    }

    baseColumns.push({
      key: 'supportedScopeOverrides',
      title: t('objectWorkspace.supportedScopes', { defaultValue: '支持范围' }),
      render: (val) => {
        const scopes = Array.isArray(val) ? val : []
        if (!scopes.length) {
          return <span className="text-xs text-muted-foreground">—</span>
        }
        return (
          <span className="text-xs text-muted-foreground">
            {scopes.map((scope) => t(`authorization.${String(scope)}`)).join(' · ')}
          </span>
        )
      },
    })

    if (canOverview) {
      baseColumns.push({
        key: 'referenceRoleCount',
        title: t('permissionCatalog.referenceRoleCount', { defaultValue: '持有角色' }),
        render: (val, row) => {
          const count = Number(val ?? 0)
          const label = Number.isFinite(count) ? String(count) : '0'
          const permissionName = value(row, 'name') || value(row, 'code')
          return (
            <Button
              type="button"
              size="xs"
              variant="outline"
              aria-label={`查看持有角色：${permissionName}`}
              onClick={(event) => {
                event.stopPropagation()
                selectRow(value(row, collection.rowKey))
                setInspectRow(row)
              }}
            >
              <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-mono tabular-nums">{label}</span>
            </Button>
          )
        },
      })
    }

    return baseColumns
  }, [canOverview, collection.columns, collection.rowKey, selectRow, t])

  const rowActions = useMemo(() => {
    if (!controller) return collection.actions
    return (row: Record<string, unknown>) => {
      const permissionName = value(row, 'name') || value(row, 'code')
      const legacy = isLegacyPermissionRow(row)
      const canConfigure = hasEditPerm && hasAllEditScope && !legacy
      const disabledReason = legacy
        ? t('permissionCatalog.legacyReadOnly')
        : t('permissionCatalog.configureRequiresAllScope')
      return (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {hasListPerm && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label={`${t('permissionCatalog.details')}：${permissionName}`}
              onClick={(event) => {
                event.stopPropagation()
                selectRow(value(row, collection.rowKey))
                if (onOpenDetails) onOpenDetails(row)
                else controller.actions.openView(row)
              }}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              <span>{t('authorization.detailsShort', { defaultValue: '详情' })}</span>
            </Button>
          )}
          <span
            title={canConfigure ? t('permissionCatalog.edit') : disabledReason}
            className="inline-flex"
          >
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={!canConfigure}
              aria-label={`${t('permissionCatalog.configureAction')}：${permissionName}`}
              onClick={(event) => {
                event.stopPropagation()
                if (!canConfigure) return
                selectRow(value(row, collection.rowKey))
                controller.actions.openEdit(row)
              }}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              <span>{t('permissionCatalog.configureAction')}</span>
            </Button>
          </span>
        </div>
      )
    }
  }, [
    collection.actions,
    collection.rowKey,
    controller,
    hasAllEditScope,
    hasEditPerm,
    hasListPerm,
    onOpenDetails,
    selectRow,
    t,
  ])

  const intentHighlightKey = useMemo(() => {
    if (!intent?.id && !intent?.focusTargetId) return selectedRowKey
    const match = collection.rows?.find(
      (row) =>
        (intent.id && value(row, 'code') === intent.id) ||
        (intent.focusTargetId && value(row, 'code') === intent.focusTargetId) ||
        value(row, collection.rowKey) === intent.id,
    )
    return match ? value(match, collection.rowKey) : selectedRowKey
  }, [collection.rowKey, collection.rows, intent, selectedRowKey])

  return (
    <div className="space-y-4">
      <LivingContextBar source={intent?.source} />

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
            {t('objectWorkspace.matchingDefinitions', { defaultValue: '项权限' })}
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

      <DynaTable
        {...collection}
        columns={enhancedColumns}
        actions={rowActions}
        activeRowKey={intentHighlightKey}
        onRowClick={(row, key) => {
          selectRow(key)
          if (canOverview) setInspectRow(row)
        }}
      />

      <Dialog
        open={inspectRow !== null}
        onOpenChange={(open) => {
          if (!open) setInspectRow(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          {inspectRow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{value(inspectRow, 'name') || value(inspectRow, 'code')}</span>
                    <Badge variant={Number(inspectRow.status) === 1 ? 'success' : 'secondary'}>
                      {t(
                        Number(inspectRow.status) === 1
                          ? 'authorization.active'
                          : 'authorization.inactive',
                      )}
                    </Badge>
                  </span>
                  {controller &&
                    hasEditPerm &&
                    hasAllEditScope &&
                    !isLegacyPermissionRow(inspectRow) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          const target = inspectRow
                          setInspectRow(null)
                          controller.actions.openEdit(target)
                        }}
                      >
                        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                        <span>{t('permissionCatalog.configureAction')}</span>
                      </Button>
                    )}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-foreground">
                    {value(inspectRow, 'code')}
                  </code>
                  {value(inspectRow, 'description') && (
                    <span>· {value(inspectRow, 'description')}</span>
                  )}
                </div>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <ShieldCheck className="size-4 text-brand-text" aria-hidden="true" />
                    {t('commandQa.q.holders')}
                  </span>
                  {holdersQuery.data && (
                    <span className="tabular-nums">
                      {t('commandQa.holdersSummary', {
                        total: holdersQuery.data.roles.length,
                        active: holdersQuery.data.activeRoleCount,
                        users: holdersQuery.data.coveredVisibleUserCount,
                      })}
                    </span>
                  )}
                </div>

                {holdersQuery.isLoading ? (
                  <p className="py-4 text-xs text-muted-foreground">{t('commandQa.querying')}</p>
                ) : holdersQuery.isError ? (
                  <div className="flex items-center justify-between gap-2 py-2 text-xs text-destructive">
                    <span>
                      {holdersQuery.error instanceof ApiError
                        ? holdersQuery.error.message
                        : t('commandQa.failed')}
                    </span>
                    <Button variant="outline" size="xs" onClick={() => void holdersQuery.refetch()}>
                      {t('commandQa.retry')}
                    </Button>
                  </div>
                ) : (holdersQuery.data?.roles ?? []).length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {t('commandQa.noHolders')}
                  </p>
                ) : (
                  <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto overscroll-contain">
                    {(holdersQuery.data?.roles ?? []).map((role) => (
                      <li
                        key={role.roleId}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{role.roleName}</span>
                            <code className="font-mono text-xs text-muted-foreground">
                              {role.roleKey}
                            </code>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                                {role.validFrom?.replace('T', ' ') ?? '∞'} →{' '}
                                {role.validUntil?.replace('T', ' ') ?? '∞'}
                              </span>
                            )}
                            {holdersQuery.data?.membersVisible && (
                              <span
                                className={cn(
                                  'tabular-nums',
                                  role.members.length === 0 && 'opacity-70',
                                )}
                              >
                                · {role.visibleMemberCount} 名成员
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant={role.state === 'ACTIVE' ? 'success' : 'secondary'}>
                          {t(`commandQa.state.${role.state}`, { defaultValue: role.state })}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
