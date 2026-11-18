/**
 * 登录日志（只读页）：A1（登录观察）⇄ A4（完整列表）严格互斥分屏。
 * - overview 视图：首屏 100% 展示 4 项脉冲指标 + 7×24 热力矩阵 / 时段趋势，绝不同屏堆叠下方分页表；
 *   点击热力格、趋势桶或失败指标时，按需滑出右侧时段快览抽屉（顶置 <LivingContextBar> 涉及账号胶囊 + 紧凑记录流 + 在完整列表中展开）。
 * - list 视图：展示紧凑搜索与 40px 纯文本高可读表格（用户名列零 EntityPill 膨胀），行详情抽屉顶置 <LivingContextBar>。
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Eye, FilterX, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DynaSearch, DynaTable, type DynaColumn, type DynaSearchField } from '@/components/dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { CoupledMotionGroup } from '@/components/motion'
import { EntityPeekLink } from '@/components/navigation'
import { ResponsiveInspector } from '@/components/spatial'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { summarizeUserAgent } from '@/lib/user-agent'
import { useAuthStore } from '@/stores/auth'

import { LoginActivitySection } from './LoginActivitySection'
import {
  buildLoginStreamQuery,
  hasActiveCausalFilter,
  type LoginCausalFilter,
} from './login-heatmap.model'
import { pageLoginLogs, type LoginLogRow } from './login-log.api'

const DEFAULT_PAGE_SIZE = 10

const searchFields: DynaSearchField[] = [
  { name: 'keyword', label: '用户名 / IP', type: 'input', placeholder: '用户名 / IP' },
  {
    name: 'success',
    label: '登录结果',
    type: 'select',
    placeholder: '全部结果',
    options: [
      { label: '成功', value: '1' },
      { label: '失败', value: '0' },
    ],
  },
  { name: 'date', label: '登录日期', type: 'date-range' },
]

const pad = (hour: number) => String(hour).padStart(2, '0')

export default function LoginLogPage() {
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  return <LoginLogWorkspace key={epoch} />
}

function LoginLogWorkspace() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [draftSearch, setDraftSearch] = useState<Record<string, string>>({})
  const [appliedSearch, setAppliedSearch] = useState<Record<string, string>>({})
  const [causalFilter, setCausalFilter] = useState<LoginCausalFilter>({ range: 'WEEK' })
  const [detail, setDetail] = useState<LoginLogRow | null>(null)
  const desktop = useDesktopViewport()
  const canViewStats = useAuthStore((state) => state.perms.includes('system:log:login'))
  const hasOverview = desktop && canViewStats
  const [activityCollapsed, setActivityCollapsed] = useState(false)

  const keyword = appliedSearch.keyword ?? ''
  const streamQuery = useMemo(
    () =>
      buildLoginStreamQuery(keyword, causalFilter, {
        success: appliedSearch.success,
        dateBegin: appliedSearch.dateBegin,
        dateEnd: appliedSearch.dateEnd,
      }),
    [appliedSearch, causalFilter, keyword],
  )
  const causalActive = hasActiveCausalFilter(causalFilter)

  const columns = useMemo<DynaColumn[]>(
    () => [
      { key: 'username', title: '用户名' },
      { key: 'ip', title: 'IP 地址' },
      { key: 'message', title: '提示消息' },
      { key: 'deviceSummary', title: '设备' },
      {
        key: 'success',
        title: '登录状态',
        type: 'dict',
        dictType: 'sys_common_status',
        sticky: 'right',
      },
      { key: 'loginTime', title: '登录时间', type: 'datetime', sticky: 'right' },
    ],
    [],
  )

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['system', 'logs', 'login', page, pageSize, streamQuery],
    queryFn: ({ signal }) => pageLoginLogs(page, pageSize, streamQuery, signal),
  })
  useResourceDenial({
    errors: [error],
    clear: { queryKey: ['system', 'logs', 'login'] },
    reset: () => setDetail(null),
  })
  const rows = useMemo(
    () =>
      data?.list.map((row) => ({
        ...row,
        deviceSummary: summarizeUserAgent(row.userAgent),
      })),
    [data],
  )

  const retry = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['system', 'logs', 'login'] }),
    [queryClient],
  )
  const resetFilters = useCallback(() => {
    setDraftSearch({})
    setAppliedSearch({})
    setCausalFilter((prev) => ({ range: prev.range }))
    setPage(1)
  }, [])
  const clearCausalOnly = useCallback(() => {
    setCausalFilter((prev) => ({ range: prev.range }))
    setPage(1)
  }, [])
  const changePageSize = useCallback((size: number) => {
    setPage(1)
    setPageSize(size)
  }, [])
  const handleCausalFilterChange = useCallback((next: LoginCausalFilter) => {
    setCausalFilter(next)
    setPage(1)
  }, [])
  const renderActions = useCallback(
    (row: Record<string, unknown>) => (
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t('common.详情', { defaultValue: '详情' })}
        onClick={() => setDetail(row as LoginLogRow)}
      >
        <Eye className="size-3.5" />
      </Button>
    ),
    [t],
  )

  const rangeLabel = systemT(`logInsight.range${causalFilter.range}`, {
    defaultValue:
      causalFilter.range === 'DAY'
        ? '近 24 小时'
        : causalFilter.range === 'WEEK'
          ? '近 7 天'
          : '近 30 天',
  })

  return (
    <CoupledMotionGroup activeId={detail ? String(detail.id) : null}>
      <div data-theme-stage="" className="w-full min-w-0 space-y-4 p-4 sm:p-6">
        <PageHeader
          title={t('common.登录日志', { defaultValue: '登录日志' })}
          actions={
            <div className="flex items-center gap-2">
              {hasOverview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={!activityCollapsed}
                  onClick={() => setActivityCollapsed((collapsed) => !collapsed)}
                >
                  <Activity className="size-4" aria-hidden="true" />
                  {activityCollapsed ? '展开活动概览' : '收起活动概览'}
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                aria-label={t('dyna.queryRefresh')}
                onClick={retry}
                disabled={isFetching}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          }
        />

        {hasOverview && !activityCollapsed && (
          <LoginActivitySection
            causalFilter={causalFilter}
            onCausalFilterChange={handleCausalFilterChange}
          />
        )}

        <section className="space-y-3" aria-label={systemT('logInsight.records')}>
          {causalActive && (
            <div
              role="status"
              aria-label="当前热力与指标联动筛选"
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border-subtle bg-muted/30 px-3 py-1.5 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">联动筛选：</span>
                <Badge variant="outline">窗口 {rangeLabel}</Badge>
                {causalFilter.cell && (
                  <Badge variant="default">
                    {systemT(`logInsight.weekday${causalFilter.cell.isoWeekday}`)}{' '}
                    {pad(causalFilter.cell.hour)}:00–{pad(causalFilter.cell.hour + 1)}:00
                  </Badge>
                )}
                {causalFilter.bucket && (
                  <Badge variant="default">时段桶 {causalFilter.bucket.label}</Badge>
                )}
                {causalFilter.success !== undefined && (
                  <Badge variant={causalFilter.success === 1 ? 'success' : 'destructive'}>
                    {causalFilter.success === 1 ? '仅看成功登录' : '仅看失败登录'}
                  </Badge>
                )}
              </div>
              <Button type="button" size="xs" variant="ghost" onClick={clearCausalOnly}>
                <FilterX className="size-3.5" aria-hidden="true" />
                清除筛选
              </Button>
            </div>
          )}

          <DynaSearch
            fields={searchFields}
            values={draftSearch}
            onChange={(name, value) => setDraftSearch((draft) => ({ ...draft, [name]: value }))}
            onSearch={() => {
              setPage(1)
              setAppliedSearch({ ...draftSearch })
            }}
            onReset={resetFilters}
          />

          <DynaTable
            columns={columns}
            rows={rows}
            loading={isLoading}
            error={error}
            refreshing={isFetching}
            onRetry={retry}
            filtered={
              keyword.trim().length > 0 ||
              causalActive ||
              Boolean(appliedSearch.success || appliedSearch.dateBegin || appliedSearch.dateEnd)
            }
            onResetFilters={resetFilters}
            rowKey="id"
            actions={renderActions}
            page={page}
            size={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
            activeRowKey={detail ? String(detail.id) : null}
          />

          <ResponsiveInspector
            mode="sheet"
            open={detail !== null}
            onOpenChange={(open) => !open && setDetail(null)}
            title={t('common.loginDetails')}
            context={
              detail ? `${detail.username} · ${detail.ip ?? t('common.unknownIp')}` : undefined
            }
          >
            {detail && (
              <div className="space-y-3">
                <dl className="grid gap-2.5 text-sm sm:grid-cols-2">
                  <div className="rounded-control border border-border-subtle bg-muted/20 p-2.5">
                    <dt className="text-xs text-muted-foreground">登录账号</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-medium">
                      <EntityPeekLink kind="user" id={detail.username} label={detail.username} />
                      <EntityPeekLink
                        kind="session"
                        id={detail.username}
                        label="在线会话"
                        className="text-xs"
                      />
                    </dd>
                  </div>
                  <div className="rounded-control border border-border-subtle bg-muted/20 p-2.5">
                    <dt className="text-xs text-muted-foreground">
                      {t('dyna.登录时间', { defaultValue: '登录时间' })}
                    </dt>
                    <dd className="mt-0.5 font-mono text-xs font-medium">
                      {detail.loginTime.replace('T', ' ')}
                    </dd>
                  </div>
                  <div className="rounded-control border border-border-subtle bg-muted/20 p-2.5 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{t('common.queryResult')}</dt>
                    <dd className="mt-0.5 font-medium">{detail.message ?? '-'}</dd>
                  </div>
                  <div className="rounded-control border border-border-subtle bg-muted/20 p-2.5 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{t('common.deviceSummary')}</dt>
                    <dd className="mt-0.5 font-medium">{summarizeUserAgent(detail.userAgent)}</dd>
                  </div>
                  <div className="rounded-control border border-border-subtle bg-muted/20 p-2.5 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{t('common.rawUserAgent')}</dt>
                    <dd className="mt-0.5 font-mono text-xs break-all">
                      {detail.userAgent ?? '-'}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </ResponsiveInspector>
        </section>
      </div>
    </CoupledMotionGroup>
  )
}
