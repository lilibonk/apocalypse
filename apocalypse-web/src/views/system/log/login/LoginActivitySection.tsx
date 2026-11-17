/**
 * Desktop sign-in overview above the log table: server-aggregated 4 compact metric cards,
 * 24h/7d/30d range switcher, Heatmap | Trend dual-mode visualization, and interactive
 * causal drilldown (clicking a 7×24 cell, trend bucket bar, or status card filters the table below).
 */
import { useQuery } from '@tanstack/react-query'
import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { MetricValue } from '@/components/motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { stateMotion } from '@/design/motion'
import { useFirstEntrance } from '@/hooks/useFirstEntrance'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import {
  getLoginHeatmap,
  getLoginInsights,
  logInsightRanges,
  type LoginHeatmap,
  type LoginHeatmapCell,
  type LoginInsights,
  type LogInsightRange,
} from '@/views/system/log/log-insight.api'

import {
  FAILURE_MIN,
  FAILURE_RATIO,
  computeBucketWindow,
  failureConcentrated,
  heatLevel,
  heatmapRows,
  moveCell,
  type LoginCausalFilter,
} from './login-heatmap.model'
import './login-heatmap.css'

type ActivityMode = 'heatmap' | 'trend'

const pad = (hour: number) => String(hour).padStart(2, '0')

export interface LoginActivitySectionProps {
  causalFilter?: LoginCausalFilter
  onCausalFilterChange?: (next: LoginCausalFilter) => void
}

export function LoginActivitySection({
  causalFilter: externalFilter,
  onCausalFilterChange,
}: LoginActivitySectionProps = {}) {
  const { t, i18n } = useTranslation('system')
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh'
  const motionEnabled = useMotionPreference()
  const epoch = useAuthStore((state) => state.sessionEpoch)
  const [internalFilter, setInternalFilter] = useState<LoginCausalFilter>({ range: 'WEEK' })
  const [mode, setMode] = useState<ActivityMode>('heatmap')
  const [focus, setFocus] = useState({ row: 0, column: new Date().getHours() })

  const filter = externalFilter ?? internalFilter
  const updateFilter = (next: LoginCausalFilter) => {
    setInternalFilter(next)
    onCausalFilterChange?.(next)
  }

  const range = filter.range
  const heatmapRange: Exclude<LogInsightRange, 'DAY'> = range === 'DAY' ? 'WEEK' : range

  const insights = useQuery({
    queryKey: ['system', 'logs', 'login', 'insights', epoch, range],
    queryFn: ({ signal }) => getLoginInsights(range, signal),
  })
  const heatmap = useQuery({
    queryKey: ['system', 'logs', 'login', 'heatmap', epoch, heatmapRange],
    queryFn: ({ signal }) => getLoginHeatmap(heatmapRange, signal),
  })

  const stats = insights.data
  const successRate = stats && stats.total > 0 ? (stats.succeeded / stats.total) * 100 : null

  const handleRangeChange = (nextRange: LogInsightRange) => {
    updateFilter({
      range: nextRange,
      success: filter.success,
      cell: nextRange === 'DAY' ? undefined : filter.cell,
      bucket: undefined,
    })
    if (nextRange === 'DAY' && mode === 'heatmap') {
      setMode('trend')
    }
  }

  const toggleStatusFilter = (targetSuccess: 0 | 1 | undefined) => {
    updateFilter({
      ...filter,
      success: filter.success === targetSuccess ? undefined : targetSuccess,
    })
  }

  const toggleCellFilter = (isoWeekday: number, hour: number) => {
    const isSame = filter.cell?.isoWeekday === isoWeekday && filter.cell?.hour === hour
    updateFilter({
      ...filter,
      cell: isSame ? undefined : { isoWeekday, hour },
      bucket: undefined,
    })
  }

  return (
    <section aria-labelledby="login-activity-title" className="login-activity p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 id="login-activity-title" className="font-semibold">
            {t('logInsight.title')}
          </h2>
          {heatmap.data && (
            <span className="font-mono text-xs text-muted-foreground">
              {heatmap.data.coveredFrom} → {heatmap.data.to} ({heatmap.data.zone})
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="可视化模式"
            value={mode}
            onChange={(val) => setMode(val as ActivityMode)}
            options={[
              { value: 'heatmap', label: '热力矩阵' },
              { value: 'trend', label: '时段趋势' },
            ]}
          />
          <SegmentedControl
            label={t('logInsight.range')}
            value={range}
            onChange={(val) => handleRangeChange(val as LogInsightRange)}
            options={logInsightRanges.map((option) => ({
              value: option,
              label: t(`logInsight.range${option}`, {
                defaultValue:
                  option === 'DAY' ? '近 24 小时' : option === 'WEEK' ? '近 7 天' : '近 30 天',
              }),
            }))}
          />
        </div>
      </div>

      <div id="login-activity-body" className="mt-3.5 space-y-3.5">
        {insights.isError || heatmap.isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-control bg-muted p-3 text-sm"
          >
            <span className="min-w-0 flex-1">
              {(insights.error ?? heatmap.error) instanceof ApiError
                ? ((insights.error ?? heatmap.error) as ApiError).message
                : t('logInsight.failed')}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void insights.refetch()
                void heatmap.refetch()
              }}
            >
              {t('logInsight.retry')}
            </Button>
          </div>
        ) : null}

        {!stats ? (
          insights.isPending && <Skeleton className="h-16 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <button
              type="button"
              data-interactive="true"
              data-active={filter.success === undefined ? 'false' : undefined}
              onClick={() => toggleStatusFilter(undefined)}
              className="login-metric-card"
            >
              <span className="text-xs text-muted-foreground">{t('logInsight.total')}</span>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="insight-metric text-2xl font-semibold text-foreground">
                  <MetricValue
                    value={stats.total}
                    variant="hero-odometer"
                    language={language}
                    motionEnabled={motionEnabled}
                  />
                </span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  峰值 {stats.peak}
                </span>
              </div>
            </button>

            <button
              type="button"
              data-interactive="true"
              data-active={filter.success === 1 ? 'true' : 'false'}
              onClick={() => toggleStatusFilter(1)}
              className="login-metric-card"
            >
              <span className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t('logInsight.successRate')}</span>
                <Badge variant="success">成功 {stats.succeeded}</Badge>
              </span>
              <span className="insight-metric mt-1 text-xl font-semibold text-foreground">
                <MetricValue
                  value={successRate}
                  decimals={1}
                  suffix="%"
                  variant="tabular"
                  language={language}
                />
              </span>
            </button>

            <button
              type="button"
              data-interactive="true"
              data-active={filter.success === 0 ? 'true' : 'false'}
              onClick={() => toggleStatusFilter(0)}
              className="login-metric-card"
            >
              <span className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t('logInsight.failedCount')}</span>
                {stats.failed > 0 && <Badge variant="destructive">点击筛选失败</Badge>}
              </span>
              <span className="insight-metric mt-1 text-xl font-semibold text-foreground">
                <MetricValue value={stats.failed} variant="tabular" language={language} />
              </span>
            </button>

            <div className="login-metric-card" data-interactive="false">
              <span className="text-xs text-muted-foreground">
                {t('logInsight.accounts')} / {t('logInsight.ips')}
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="insight-metric text-xl font-semibold text-foreground">
                  <MetricValue value={stats.distinctUsers} variant="tabular" language={language} />
                </span>
                <span className="text-xs text-muted-foreground">
                  账号 ·{' '}
                  <MetricValue value={stats.distinctIps} variant="tabular" language={language} /> IP
                </span>
              </div>
            </div>
          </div>
        )}

        {mode === 'trend' ? (
          stats ? (
            <TrendBuckets
              insights={stats}
              selectedBucketFrom={filter.bucket?.bucketFrom}
              onSelectBucket={(bucket) =>
                updateFilter({
                  ...filter,
                  cell: undefined,
                  bucket: filter.bucket?.bucketFrom === bucket.bucketFrom ? undefined : bucket,
                })
              }
            />
          ) : (
            insights.isPending && <Skeleton className="h-40 w-full" />
          )
        ) : heatmap.data ? (
          <Heatmap
            data={heatmap.data}
            motionEnabled={motionEnabled}
            focus={focus}
            setFocus={setFocus}
            selectedCell={filter.cell}
            onSelectCell={toggleCellFilter}
          />
        ) : (
          heatmap.isPending && <Skeleton className="h-48 w-full" />
        )}
      </div>
    </section>
  )
}

function TrendBuckets({
  insights,
  selectedBucketFrom,
  onSelectBucket,
}: {
  insights: LoginInsights
  selectedBucketFrom?: string
  onSelectBucket: (bucket: { label: string; bucketFrom: string; bucketTo: string }) => void
}) {
  const maxTotal = Math.max(1, ...insights.buckets.map((b) => b.total))
  return (
    <div className="space-y-2">
      <div role="list" aria-label="登录时段趋势柱状图" className="login-trend-grid">
        {insights.buckets.map((bucket, idx) => {
          const nextStart = insights.buckets[idx + 1]?.start ?? insights.to
          const window = computeBucketWindow(bucket.start, nextStart)
          const selected = selectedBucketFrom === window.bucketFrom
          const totalPct = Math.max(6, Math.round((bucket.total / maxTotal) * 100))
          const failedPct = bucket.total > 0 ? Math.round((bucket.failed / bucket.total) * 100) : 0
          const shortLabel =
            insights.bucketUnit === 'HOURS' ? bucket.start.slice(11, 16) : bucket.start.slice(5, 10)
          return (
            <button
              key={bucket.start}
              type="button"
              role="listitem"
              data-selected={selected ? 'true' : 'false'}
              aria-label={`${bucket.start} 共 ${bucket.total} 次，失败 ${bucket.failed} 次`}
              onClick={() =>
                onSelectBucket({
                  label: bucket.start,
                  bucketFrom: window.bucketFrom,
                  bucketTo: window.bucketTo,
                })
              }
              className="login-trend-bar-btn"
            >
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className={cn(
                    'flex w-full max-w-5 flex-col justify-end overflow-hidden rounded-t-full transition-all',
                    selected ? 'bg-primary' : 'bg-primary/35',
                  )}
                  style={{ height: `${totalPct}%` }}
                >
                  {failedPct > 0 && (
                    <div
                      className="w-full rounded-t-full bg-warning"
                      style={{ height: `${failedPct}%` }}
                    />
                  )}
                </div>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {idx % 2 === 0 ? shortLabel : ''}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>点击任意时间桶可筛选该时段内的登录明细记录</span>
        <span>
          窗口：{insights.from} → {insights.to} ({insights.zone} {insights.utcOffset})
        </span>
      </div>
    </div>
  )
}

function Heatmap({
  data,
  motionEnabled,
  focus,
  setFocus,
  selectedCell,
  onSelectCell,
}: {
  data: LoginHeatmap
  motionEnabled: boolean
  focus: { row: number; column: number }
  setFocus: (value: { row: number; column: number }) => void
  selectedCell?: { isoWeekday: number; hour: number }
  onSelectCell: (isoWeekday: number, hour: number) => void
}) {
  const { t } = useTranslation('system')
  const rows = heatmapRows(data.cells)
  const [hovered, setHovered] = useState<{ row: number; column: number } | null>(null)
  const first = useFirstEntrance('system:login:heatmap')
  const [waveDone, setWaveDone] = useState(!motionEnabled)
  const wave = motionEnabled && first && !waveDone
  const weekday = (day: number) => t(`logInsight.weekday${day}`)
  const describe = (cell: LoginHeatmapCell) =>
    cell.slots === 0
      ? t('logInsight.cellUncovered', { day: weekday(cell.isoWeekday), hour: pad(cell.hour) })
      : t('logInsight.cellReadout', {
          day: weekday(cell.isoWeekday),
          hour: pad(cell.hour),
          next: pad(cell.hour + 1),
          total: cell.total,
          failed: cell.failed,
        })
  const shown = hovered ? rows[hovered.row][hovered.column] : rows[focus.row][focus.column]
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const currentCell = rows[focus.row]?.[focus.column]
      if (currentCell) {
        onSelectCell(currentCell.isoWeekday, currentCell.hour)
      }
      return
    }
    const next = moveCell(focus, event.key)
    if (!next) return
    event.preventDefault()
    setFocus(next)
    setHovered(null)
    event.currentTarget
      .querySelector<HTMLElement>(`[data-cell="${next.row}-${next.column}"]`)
      ?.focus()
  }
  return (
    <div className="space-y-3">
      <div
        role="grid"
        aria-label={t('logInsight.heatmapLabel', { zone: data.zone, offset: data.utcOffset })}
        aria-readonly="true"
        className="login-heatmap"
        data-wave={wave || undefined}
        onKeyDown={onKeyDown}
        onAnimationEnd={(event) => {
          if ((event.target as HTMLElement).dataset.cell === '6-23') setWaveDone(true)
        }}
      >
        <div role="row" className="login-heatmap-row" aria-hidden="true">
          <span className="login-heatmap-day" />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="login-heatmap-hour">
              {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
            </span>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div role="row" key={rowIndex} className="login-heatmap-row">
            <span role="rowheader" className="login-heatmap-day">
              {weekday(rowIndex + 1)}
            </span>
            {row.map((cell, column) => {
              const focused = focus.row === rowIndex && focus.column === column
              const isSelected =
                selectedCell?.isoWeekday === cell.isoWeekday && selectedCell?.hour === cell.hour
              const style = {
                '--heat-column': column,
                animationDelay: wave ? `${column * stateMotion.heatColumnDelay}s` : undefined,
              } as CSSProperties
              return (
                <div
                  key={column}
                  role="gridcell"
                  tabIndex={focused ? 0 : -1}
                  data-cell={`${rowIndex}-${column}`}
                  data-level={cell.slots === 0 ? undefined : heatLevel(cell.total, data.maxCell)}
                  data-uncovered={cell.slots === 0 || undefined}
                  data-failure={failureConcentrated(cell) || undefined}
                  data-selected={isSelected ? 'true' : undefined}
                  aria-selected={isSelected}
                  aria-label={describe(cell)}
                  className="login-heatmap-cell"
                  style={style}
                  onFocus={() => setFocus({ row: rowIndex, column })}
                  onClick={() => {
                    setFocus({ row: rowIndex, column })
                    onSelectCell(cell.isoWeekday, cell.hour)
                  }}
                  onPointerEnter={() => setHovered({ row: rowIndex, column })}
                  onPointerLeave={() => setHovered(null)}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p aria-live="polite" className="min-h-5 font-medium text-foreground">
          {describe(shown)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            {t('logInsight.less')}
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} className="login-heatmap-swatch" data-level={level} />
            ))}
            {t('logInsight.more')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="login-heatmap-swatch" data-uncovered="" />
            {t('logInsight.uncovered')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="login-heatmap-swatch" data-level={2} data-failure="" />
            {t('logInsight.failureLegend', {
              min: FAILURE_MIN,
              ratio: Math.round(FAILURE_RATIO * 100),
            })}
          </span>
        </div>
      </div>
    </div>
  )
}
