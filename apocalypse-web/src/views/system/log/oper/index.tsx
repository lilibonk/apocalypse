/**
 * 操作日志（只读页，逃逸舱手写）：DynaSearch + DynaTable + 长审计详情 Sheet。
 * 端点 GET /system/logs/oper?page&size&keyword（直接拼 query，无 /page 后缀）。
 * 状态列走字典 sys_common_status（成功 1 / 失败 0）；耗时列在行数据侧格式化为 `xx ms`。
 */

import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Eye, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DynaSearch, DynaTable, type DynaColumn, type DynaSearchField } from '@/components/dyna'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { PageHeader } from '@/components/layout/PageHeader'
import { DictTag } from '@/components/DictTag'
import { useAuthStore } from '@/stores/auth'
import './oper-log.css'

import { pageOperLogs, type OperLogRow } from './oper-log.api'
import { formatPayload, operTypeLabel } from './oper-log.model'

const DEFAULT_PAGE_SIZE = 10

const columns: DynaColumn[] = [
  { key: 'eventSummary', title: '事件' },
  { key: 'operName', title: '操作人' },
  { key: 'operIp', title: '操作 IP' },
  { key: 'costTimeText', title: '耗时' },
  {
    key: 'status',
    title: '操作状态',
    type: 'dict',
    dictType: 'sys_common_status',
    sticky: 'right',
  },
  { key: 'operTime', title: '操作时间', type: 'datetime', sticky: 'right' },
]

const searchFields: DynaSearchField[] = [
  { name: 'keyword', label: '模块 / 操作人', type: 'input', placeholder: '模块 / 操作人' },
]

/** 详情字段块：长内容在块内滚动，空值显示 -，可复制原文。 */
function DetailBlock({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const formatted = formatPayload(value)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(value ?? '')
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{label}</div>
        {formatted && (
          <Button variant="ghost" size="xs" onClick={() => void copy()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
        )}
      </div>
      {copyFailed && (
        <p role="alert" className="text-xs text-destructive">
          {systemT('operLog.copyFailed')}
        </p>
      )}
      <pre className="oper-log-payload max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap break-all">
        {formatted ?? '-'}
      </pre>
    </div>
  )
}

export default function OperLogPage() {
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  return <OperLogWorkspace key={epoch} />
}

function OperLogWorkspace() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [draftSearch, setDraftSearch] = useState<Record<string, string>>({})
  const [appliedSearch, setAppliedSearch] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<OperLogRow | null>(null)

  const keyword = appliedSearch.keyword ?? ''
  const displayColumns = useMemo(
    () =>
      columns.map((column) =>
        column.key === 'eventSummary' ? { ...column, title: systemT('operLog.event') } : column,
      ),
    [systemT],
  )

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['system', 'logs', 'oper', page, pageSize, keyword],
    queryFn: ({ signal }) => pageOperLogs(page, pageSize, keyword, signal),
  })
  useResourceDenial({
    errors: [error],
    clear: { queryKey: ['system', 'logs', 'oper'] },
    reset: () => setDetail(null),
  })

  // DynaTable 文本列只做 String()，耗时 `xx ms` 的格式化在行数据侧完成（costTime → costTimeText）
  const rows = useMemo(
    () =>
      data?.list.map((row) => ({
        ...row,
        costTimeText: row.costTime === null ? null : `${row.costTime} ms`,
        eventSummary: `${row.title ?? systemT('operLog.unrecorded')} · ${operTypeLabel(row.businessType, systemT)}`,
      })),
    [data, systemT],
  )

  // Stable callbacks: opening the detail Sheet re-renders only the highlighted row.
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
        onClick={() => setDetail(row as OperLogRow)}
      >
        <Eye className="size-3.5" />
      </Button>
    ),
    [t],
  )

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t('common.操作日志', { defaultValue: '操作日志' })}
        description={t('common.系统操作审计记录（只读）', {
          defaultValue: '系统操作审计记录（只读）',
        })}
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

      <p className="text-xs text-muted-foreground">
        {systemT('operLog.filterContext', { keyword: keyword || systemT('operLog.allRecords') })}
      </p>
      <DynaTable
        columns={displayColumns}
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

      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{t('common.操作详情', { defaultValue: '操作详情' })}</SheetTitle>
            <SheetDescription>
              {detail ? `${detail.title ?? '-'} · ${detail.operName ?? '-'}` : ''}
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div key={detail.id} className="min-h-0 space-y-5 overflow-y-auto px-6 pb-6">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.操作人', { defaultValue: '操作人' })}
                  </dt>
                  <dd className="mt-1 break-words">{detail.operName ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.操作时间', { defaultValue: '操作时间' })}
                  </dt>
                  <dd className="mt-1 tabular-nums">{detail.operTime.replace('T', ' ')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.操作状态', { defaultValue: '操作状态' })}
                  </dt>
                  <dd className="mt-1">
                    <DictTag type="sys_common_status" value={String(detail.status)} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.耗时', { defaultValue: '耗时' })}
                  </dt>
                  <dd className="mt-1 tabular-nums">
                    {detail.costTime === null ? '-' : `${detail.costTime} ms`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.操作类型', { defaultValue: '操作类型' })}
                  </dt>
                  <dd className="mt-1 break-all">
                    {operTypeLabel(detail.businessType, systemT)}
                    {detail.businessType && (
                      <code className="ml-2 font-mono text-xs text-muted-foreground">
                        {detail.businessType}
                      </code>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.操作 IP', { defaultValue: '操作 IP' })}
                  </dt>
                  <dd className="mt-1 break-all">{detail.operIp ?? '-'}</dd>
                </div>
              </dl>
              {detail.errorMsg && (
                <div className="rounded-control border border-destructive/30 p-3">
                  <DetailBlock
                    label={t('common.异常信息', { defaultValue: '异常信息' })}
                    value={detail.errorMsg}
                  />
                </div>
              )}
              <DetailBlock label={systemT('operLog.invokedMethod')} value={detail.method} />
              <DetailBlock
                label={t('common.请求参数', { defaultValue: '请求参数' })}
                value={detail.operParam}
              />
              <DetailBlock
                label={t('common.返回结果', { defaultValue: '返回结果' })}
                value={detail.operResult}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
