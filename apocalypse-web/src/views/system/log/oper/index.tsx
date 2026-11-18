/**
 * 操作日志（只读页）：顶部紧凑业务类型脉冲条（getOperInsights）+ 40px 高密度结构化事件表 +
 * 来源行锚定高亮（data-origin-active）+ 右侧同步滑入的审计证据抽屉（4 宫格摘要、↑/↓ 邻行快速检视、
 * 操作人/目标域 EntityPill、深色格式化 JSON 块与 "******" 脱敏字段视觉标识）。
 */

import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, Copy, Eye, FilterX, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DictTag } from '@/components/DictTag'
import { DynaSearch, DynaTable, type DynaColumn, type DynaSearchField } from '@/components/dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { CoupledMotionGroup, MetricValue } from '@/components/motion'
import { EntityPeekLink, LivingContextBar, useEntityIntent } from '@/components/navigation'
import { ResponsiveInspector } from '@/components/spatial'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'
import {
  getOperInsights,
  logInsightRanges,
  type LogInsightRange,
} from '@/views/system/log/log-insight.api'

import './oper-log.css'
import { pageOperLogs, type OperLogRow } from './oper-log.api'
import {
  buildOperStreamQuery,
  formatPayload,
  hasActiveOperFilter,
  operTypeLabel,
  resolveOperTargetEntity,
  tokenizePayloadSegments,
  type OperCausalFilter,
} from './oper-log.model'

const DEFAULT_PAGE_SIZE = 10

const searchFields: DynaSearchField[] = [
  { name: 'keyword', label: '模块 / 操作人', type: 'input', placeholder: '模块 / 操作人' },
  {
    name: 'businessType',
    label: '操作类型',
    type: 'select',
    placeholder: '全部类型',
    options: [
      { label: '新增', value: 'INSERT' },
      { label: '修改', value: 'UPDATE' },
      { label: '删除', value: 'DELETE' },
      { label: '保存', value: 'SAVE' },
      { label: '授权', value: 'GRANT' },
      { label: '撤销授权', value: 'REVOKE' },
      { label: '导出', value: 'EXPORT' },
      { label: '强制下线', value: 'FORCE' },
    ],
  },
  {
    name: 'status',
    label: '操作状态',
    type: 'select',
    placeholder: '全部状态',
    options: [
      { label: '正常', value: '1' },
      { label: '异常', value: '0' },
    ],
  },
  { name: 'date', label: '操作日期', type: 'date-range' },
]

/** 详情字段块：长内容在块内滚动，空值显示 -，可复制原文，并对 `"******"` 脱敏值作视觉标识。 */
function DetailBlock({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const formatted = formatPayload(value)
  const segments = useMemo(() => (formatted ? tokenizePayloadSegments(formatted) : []), [formatted])
  const hasMasked = useMemo(() => segments.some((s) => s.masked), [segments])
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{label}</span>
          {hasMasked && <Badge variant="warning">含脱敏字段 ******</Badge>}
        </div>
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
      <pre className="oper-log-payload max-h-64 overflow-auto rounded-md p-3 text-xs break-all whitespace-pre-wrap">
        {!formatted
          ? '-'
          : segments.map((seg, idx) =>
              seg.masked ? (
                <mark key={idx} data-masked="true" className="oper-log-mask">
                  {seg.text}
                </mark>
              ) : (
                <span
                  key={idx}
                  className={seg.kind !== 'plain' ? `oper-log-token-${seg.kind}` : undefined}
                >
                  {seg.text}
                </span>
              ),
            )}
      </pre>
    </div>
  )
}

export default function OperLogPage() {
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  return <OperLogWorkspace key={epoch} />
}

function OperLogWorkspace() {
  const { t, i18n } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh'
  const motionEnabled = useMotionPreference()
  const { intent } = useEntityIntent()
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const canViewInsights = useAuthStore((state) => state.perms.includes('system:log:oper'))
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [draftSearch, setDraftSearch] = useState<Record<string, string>>({})
  const [appliedSearch, setAppliedSearch] = useState<Record<string, string>>({})
  const [causalFilter, setCausalFilter] = useState<OperCausalFilter>({ range: 'WEEK' })
  const [detail, setDetail] = useState<OperLogRow | null>(null)

  const keyword = appliedSearch.keyword ?? ''
  const streamQuery = useMemo(
    () =>
      buildOperStreamQuery(keyword, causalFilter, {
        businessType: appliedSearch.businessType,
        status: appliedSearch.status,
        dateBegin: appliedSearch.dateBegin,
        dateEnd: appliedSearch.dateEnd,
      }),
    [appliedSearch, causalFilter, keyword],
  )
  const causalActive = hasActiveOperFilter(causalFilter)

  const insightsQuery = useQuery({
    queryKey: ['system', 'logs', 'oper', 'insights', sessionEpoch, causalFilter.range],
    queryFn: ({ signal }) => getOperInsights(causalFilter.range, signal),
    enabled: canViewInsights,
  })

  const displayColumns = useMemo<DynaColumn[]>(
    () => [
      { key: 'eventSummary', title: systemT('operLog.event') },
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
    ],
    [systemT],
  )

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['system', 'logs', 'oper', page, pageSize, streamQuery],
    queryFn: ({ signal }) => pageOperLogs(page, pageSize, streamQuery, signal),
  })
  useResourceDenial({
    errors: [error],
    clear: { queryKey: ['system', 'logs', 'oper'] },
    reset: () => setDetail(null),
  })

  const rows = useMemo(
    () =>
      data?.list.map((row) => ({
        ...row,
        costTimeText: row.costTime === null ? null : `${row.costTime} ms`,
        eventSummary: `${row.title ?? systemT('operLog.unrecorded')} · ${operTypeLabel(row.businessType, systemT)}`,
      })),
    [data, systemT],
  )

  const currentIndex = useMemo(() => {
    if (!detail || !rows) return -1
    return rows.findIndex((r) => String(r.id) === String(detail.id))
  }, [detail, rows])

  const stepDetail = useCallback(
    (delta: -1 | 1) => {
      if (!rows || currentIndex < 0) return
      const nextRow = rows[currentIndex + delta]
      if (nextRow) {
        setDetail(nextRow)
      }
    },
    [currentIndex, rows],
  )

  useEffect(() => {
    if (!detail) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        stepDetail(-1)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        stepDetail(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detail, stepDetail])

  const retry = useCallback(() => {
    void refetch()
    void insightsQuery.refetch()
  }, [insightsQuery, refetch])

  const resetFilters = useCallback(() => {
    setDraftSearch({})
    setAppliedSearch({})
    setCausalFilter((prev) => ({ range: prev.range }))
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
        size="icon-xs"
        aria-label={t('common.详情', { defaultValue: '详情' })}
        onClick={() => setDetail(row as OperLogRow)}
      >
        <Eye className="size-3.5" />
      </Button>
    ),
    [t],
  )

  const insights = insightsQuery.data
  const targetEntity = useMemo(() => (detail ? resolveOperTargetEntity(detail) : null), [detail])

  return (
    <CoupledMotionGroup activeId={detail ? String(detail.id) : null}>
      <div className="w-full min-w-0 space-y-5 p-4 sm:p-6">
        <PageHeader
          title={t('common.操作日志', { defaultValue: '操作日志' })}
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

        {intent?.source && <LivingContextBar source={intent.source} />}

        {canViewInsights && insights && (
          <section
            aria-label="操作审计概览脉冲"
            className="oper-insight-strip sketch-surface flex flex-wrap items-center justify-between gap-2.5 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="xs"
                variant={!causalActive ? 'default' : 'ghost'}
                onClick={() => {
                  setCausalFilter((prev) => ({ range: prev.range }))
                  setPage(1)
                }}
              >
                <span>全部</span>
                <span className="ml-1 font-mono text-[11px] tabular-nums">
                  <MetricValue
                    value={insights.total}
                    variant="hero-odometer"
                    language={language}
                    motionEnabled={motionEnabled}
                  />
                </span>
              </Button>
              {insights.byBusinessType.map((entry) => {
                const code = entry.type ?? ''
                if (!code) return null
                const active = causalFilter.businessType === code
                return (
                  <Button
                    key={code}
                    type="button"
                    size="xs"
                    variant={active ? 'default' : 'ghost'}
                    onClick={() => {
                      setCausalFilter((prev) => ({
                        ...prev,
                        businessType: active ? undefined : code,
                      }))
                      setPage(1)
                    }}
                  >
                    <span>{operTypeLabel(code, systemT)}</span>
                    <span className="ml-1 font-mono text-[11px] opacity-80 tabular-nums">
                      {entry.count}
                    </span>
                  </Button>
                )
              })}
              <span className="mx-0.5 h-3.5 w-px bg-border-subtle" aria-hidden="true" />
              <Button
                type="button"
                size="xs"
                variant={causalFilter.status === 0 ? 'destructive' : 'outline'}
                onClick={() => {
                  setCausalFilter((prev) => ({
                    ...prev,
                    status: prev.status === 0 ? undefined : 0,
                  }))
                  setPage(1)
                }}
              >
                异常 {insights.failed}
              </Button>
              {causalActive && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setCausalFilter((prev) => ({ range: prev.range }))
                    setPage(1)
                  }}
                >
                  <FilterX className="size-3.5" aria-hidden="true" />
                  清除下钻
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                成功率{' '}
                <strong className="font-mono font-medium text-foreground tabular-nums">
                  <MetricValue
                    value={insights.successRate}
                    decimals={1}
                    suffix="%"
                    variant="tabular"
                    language={language}
                  />
                </strong>
              </span>
              <SegmentedControl
                label={systemT('logInsight.range')}
                value={causalFilter.range}
                onChange={(nextRange) => {
                  setCausalFilter((prev) => ({
                    ...prev,
                    range: nextRange as LogInsightRange,
                  }))
                  setPage(1)
                }}
                options={logInsightRanges.map((option) => ({
                  value: option,
                  label: systemT(`logInsight.range${option}`, {
                    defaultValue:
                      option === 'DAY' ? '近 24 小时' : option === 'WEEK' ? '近 7 天' : '近 30 天',
                  }),
                }))}
              />
            </div>
          </section>
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

        <div className="oper-log-table-dense">
          <DynaTable
            columns={displayColumns}
            rows={rows}
            loading={isLoading}
            error={error}
            refreshing={isFetching}
            onRetry={retry}
            filtered={
              keyword.trim().length > 0 ||
              causalActive ||
              Boolean(
                appliedSearch.businessType ||
                appliedSearch.status ||
                appliedSearch.dateBegin ||
                appliedSearch.dateEnd,
              )
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
        </div>

        <ResponsiveInspector
          mode="sheet"
          open={detail !== null}
          onOpenChange={(open) => !open && setDetail(null)}
          title={t('common.操作详情', { defaultValue: '操作详情' })}
          context={detail ? `${detail.title ?? '-'} · ${detail.operName ?? '-'}` : undefined}
          headerActions={
            rows && rows.length > 1 ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  aria-label="上一条日志"
                  disabled={currentIndex <= 0}
                  onClick={() => stepDetail(-1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  aria-label="下一条日志"
                  disabled={currentIndex < 0 || currentIndex >= rows.length - 1}
                  onClick={() => stepDetail(1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>
            ) : undefined
          }
        >
          {detail && (
            <div key={detail.id} className="space-y-4">
              {/* 紧凑 2×2 元信息头卡 */}
              <dl className="grid grid-cols-2 gap-2.5 rounded-control border border-border-subtle bg-muted/20 p-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.操作人', { defaultValue: '操作人' })}
                  </dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium">
                    {detail.operName ? (
                      <EntityPeekLink kind="user" id={detail.operName} label={detail.operName} />
                    ) : (
                      '-'
                    )}
                    {targetEntity && (
                      <EntityPeekLink
                        kind={targetEntity.kind}
                        id={targetEntity.id}
                        label={targetEntity.label}
                        className="text-xs"
                      />
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.操作状态', { defaultValue: '操作状态' })} /{' '}
                    {t('common.耗时', { defaultValue: '耗时' })}
                  </dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <DictTag type="sys_common_status" value={String(detail.status)} />
                    <span className="font-mono text-xs tabular-nums">
                      {detail.costTime === null ? '-' : `${detail.costTime} ms`}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.操作类型', { defaultValue: '操作类型' })}
                  </dt>
                  <dd className="mt-1 break-all">
                    {operTypeLabel(detail.businessType, systemT)}
                    {detail.businessType && (
                      <code className="ml-1.5 font-mono text-xs text-muted-foreground">
                        {detail.businessType}
                      </code>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('common.操作时间', { defaultValue: '操作时间' })} / IP
                  </dt>
                  <dd className="mt-1 font-mono text-xs tabular-nums">
                    <div>{detail.operTime.replace('T', ' ')}</div>
                    <div className="text-muted-foreground">{detail.operIp ?? '-'}</div>
                  </dd>
                </div>
              </dl>

              {detail.errorMsg && (
                <div className="rounded-panel border border-destructive/40 bg-destructive/8 p-3">
                  <DetailBlock
                    label={t('common.异常信息', { defaultValue: '异常信息' })}
                    value={detail.errorMsg}
                  />
                </div>
              )}

              <DetailBlock label={systemT('operLog.invokedMethod')} value={detail.method} />
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailBlock
                  label={t('common.请求参数', { defaultValue: '请求参数' })}
                  value={detail.operParam}
                />
                <DetailBlock
                  label={t('common.返回结果', { defaultValue: '返回结果' })}
                  value={detail.operResult}
                />
              </div>
            </div>
          )}
        </ResponsiveInspector>
      </div>
    </CoupledMotionGroup>
  )
}
