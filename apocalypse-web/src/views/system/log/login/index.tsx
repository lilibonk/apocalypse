/**
 * 登录日志（只读页，逃逸舱手写）：DynaSearch + DynaTable 组合。
 * 端点 GET /system/logs/login?page&size&keyword（直接拼 query，无 /page 后缀）。
 * 状态列走字典 sys_common_status（成功 1 / 失败 0）。
 */

import { useQuery } from '@tanstack/react-query'
import { Eye, LayoutDashboard, List, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DynaSearch, DynaTable, type DynaColumn, type DynaSearchField } from '@/components/dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { summarizeUserAgent } from '@/lib/user-agent'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'

import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'

import { LoginActivitySection } from './LoginActivitySection'
import { pageLoginLogs, type LoginLogRow } from './login-log.api'

const DEFAULT_PAGE_SIZE = 10

const columns: DynaColumn[] = [
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
]

const searchFields: DynaSearchField[] = [
  { name: 'keyword', label: '用户名 / IP', type: 'input', placeholder: '用户名 / IP' },
]

const LOGIN_LOG_VIEWS = ['list', 'overview'] as const

export default function LoginLogPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [draftSearch, setDraftSearch] = useState<Record<string, string>>({})
  const [appliedSearch, setAppliedSearch] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<LoginLogRow | null>(null)
  const desktop = useDesktopViewport()
  const canViewStats = useAuthStore((state) => state.perms.includes('system:log:login'))
  const hasOverview = desktop && canViewStats
  const [requestedView, setView] = usePageView(LOGIN_LOG_VIEWS)
  const view = hasOverview ? requestedView : 'list'

  const keyword = appliedSearch.keyword ?? ''

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['system', 'logs', 'login', page, pageSize, keyword],
    queryFn: () => pageLoginLogs(page, pageSize, keyword),
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

  // Stable callbacks: opening the detail re-renders only the highlighted row.
  const retry = useCallback(() => void refetch(), [refetch])
  const resetFilters = useCallback(() => {
    setDraftSearch({})
    setAppliedSearch({})
    setPage(1)
  }, [])
  const changePageSize = useCallback((size: number) => {
    setPage(1)
    setPageSize(size)
  }, [])
  const renderActions = useCallback(
    (row: Record<string, unknown>) => (
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('common.详情', { defaultValue: '详情' })}
        onClick={() => setDetail(row as LoginLogRow)}
      >
        <Eye className="size-3.5" />
      </Button>
    ),
    [t],
  )

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t('common.登录日志', { defaultValue: '登录日志' })}
        description={t('common.系统登录成功与失败记录（只读）', {
          defaultValue: '系统登录成功与失败记录（只读）',
        })}
        view={
          hasOverview ? (
            <SegmentedControl
              label={t('dyna.pageView')}
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: t('dyna.viewList'), icon: List },
                { value: 'overview', label: t('dyna.viewOverview'), icon: LayoutDashboard },
              ]}
            />
          ) : undefined
        }
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={t('dyna.queryRefresh')}
            onClick={retry}
            disabled={isFetching}
          >
            <RefreshCw className="size-4" />
          </Button>
        }
      />

      {view === 'overview' ? (
        <LoginActivitySection />
      ) : (
        <>
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
            filtered={keyword.trim().length > 0}
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
        </>
      )}

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.loginDetails')}</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.username} · ${detail.ip ?? t('common.unknownIp')}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">
                  {t('dyna.登录时间', { defaultValue: '登录时间' })}
                </dt>
                <dd className="mt-1 font-medium">{detail.loginTime.replace('T', ' ')}</dd>
              </div>
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">{t('common.queryResult')}</dt>
                <dd className="mt-1 font-medium">{detail.message ?? '-'}</dd>
              </div>
              <div className="rounded-md border border-border p-3 sm:col-span-2">
                <dt className="text-muted-foreground">{t('common.deviceSummary')}</dt>
                <dd className="mt-1 font-medium">{summarizeUserAgent(detail.userAgent)}</dd>
              </div>
              <div className="rounded-md border border-border p-3 sm:col-span-2">
                <dt className="text-muted-foreground">{t('common.rawUserAgent')}</dt>
                <dd className="mt-1 break-all font-mono text-xs">{detail.userAgent ?? '-'}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
