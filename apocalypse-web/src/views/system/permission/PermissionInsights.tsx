/**
 * Permission catalog insight strip: total and disabled definitions (catalog page endpoint with
 * size 1), plus the per-module distribution from the authorization overview when the viewer may
 * read it (role:list + permission:list). Module chips open the list view with the existing
 * `moduleKey` filter, so the overview leads straight into the matching rows; core definitions have
 * no module key and stay a plain chip. Queries nest under the DynaPage key.
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { DynaOverviewControls } from '@/components/dyna'
import { InsightStrip } from '@/components/insights/InsightStrip'
import { ApiError, request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { getAuthorizationOverview } from '@/views/system/role/authorization-insight.api'
import { canAskAuthorizationQuestions } from '@/views/system/role/authorization-questions.model'

const countDefinitions = (signal: AbortSignal, status?: number) =>
  request<PageResult<unknown>>('/system/permissions/page', {
    query: { page: 1, size: 1, status },
    signal,
  }).then((page) => page.total)

export function PermissionInsights({ filters, applyFilters, queryKey }: DynaOverviewControls) {
  const { t } = useTranslation('system')
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const base = [...(queryKey ?? ['system', 'permissions', 'summary']), epoch]
  const canOverview = useAuthStore(canAskAuthorizationQuestions)

  const total = useQuery({
    queryKey: [...base, 'total'],
    queryFn: ({ signal }) => countDefinitions(signal),
  })
  const disabled = useQuery({
    queryKey: [...base, 'disabled'],
    queryFn: ({ signal }) => countDefinitions(signal, 0),
  })
  const overview = useQuery({
    queryKey: [...base, 'overview'],
    queryFn: ({ signal }) => getAuthorizationOverview(signal),
    enabled: canOverview,
  })

  const modules = overview.data?.permissionModules ?? []
  const failed = [total, disabled, overview].filter((query) => query.isError)
  const error = failed[0]?.error
  const activeModule = filters.moduleKey?.trim() ?? ''
  return (
    <InsightStrip
      id="permission-insights"
      title={t('listInsights.permissions.title')}
      hint={canOverview ? t('listInsights.permissions.hint') : undefined}
      entranceKey="system:permission:insights"
      error={error ? (error instanceof ApiError ? error.message : t('listInsights.failed')) : null}
      retryText={t('listInsights.retry')}
      onRetry={() => failed.forEach((query) => void query.refetch())}
      stats={[
        ...(total.isError
          ? []
          : [
              {
                key: 'definitions',
                label: t('listInsights.permissions.definitions'),
                value: total.data ?? null,
              },
            ]),
        ...(disabled.isError
          ? []
          : [
              {
                key: 'disabled',
                label: t('listInsights.permissions.disabled'),
                hint: t('listInsights.permissions.disabledHint'),
                value: disabled.data ?? null,
              },
            ]),
        ...(canOverview && !overview.isError
          ? [
              {
                key: 'modules',
                label: t('listInsights.permissions.modules'),
                value: overview.data ? modules.length : null,
              },
            ]
          : []),
      ]}
    >
      {modules.length > 0 && (
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label={t('listInsights.permissions.modulesLabel')}
        >
          {modules.map((module) => {
            const name = module.key ?? t('listInsights.permissions.core')
            const body = (
              <>
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground tabular-nums">{module.count}</span>
                {!module.enabled && (
                  <span className="text-muted-foreground">
                    · {t('listInsights.permissions.moduleDisabled')}
                  </span>
                )}
              </>
            )
            if (!module.key)
              return (
                <span
                  key="core"
                  title={t('listInsights.permissions.coreUnfilterable')}
                  data-module-chip
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1 text-xs"
                >
                  {body}
                </span>
              )
            const active = activeModule === module.key
            return (
              <button
                key={module.key}
                type="button"
                data-module-chip
                aria-pressed={active}
                aria-label={t('listInsights.permissions.moduleFilter', {
                  name,
                  count: module.count,
                })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-[var(--insight-path)] bg-muted'
                    : 'border-border-subtle hover:bg-muted',
                )}
                // Opens the list view filtered to this module (the current filter is marked).
                onClick={() => applyFilters({ ...filters, moduleKey: module.key! })}
              >
                {body}
              </button>
            )
          })}
        </div>
      )}
    </InsightStrip>
  )
}
