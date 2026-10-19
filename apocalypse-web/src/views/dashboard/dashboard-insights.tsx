import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Minus,
  MonitorDot,
  ScrollText,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { AnimatedNumber } from '@/components/insights/AnimatedNumber'
import { InsightCard } from '@/components/insights/InsightCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { insightMotion } from '@/design/motion'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied } from '@/lib/query/use-resource-denial'
import type {
  LoginInsights,
  LogInsightRange,
  OperInsights,
} from '@/views/system/log/log-insight.api'
import type { OnlineUserRow } from '@/views/system/online/online.api'

import {
  bucketCounts,
  bucketLabel,
  dashboardRanges,
  operationTypeKey,
  periodComparison,
  trendGeometry,
  trendPath,
} from './dashboard-insights.model'
import './dashboard-insights.css'

export interface DashboardSourceState<T> {
  allowed: boolean
  data: T | undefined
  error: unknown
  isPending: boolean
  isError: boolean
  isFetching: boolean
  retry: () => void
}

export function SectionSkeleton() {
  const { t } = useTranslation('dashboard')
  return (
    <div role="status" className="space-y-4 py-5">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  )
}

export function SourceFailure({
  source,
  error,
  hasData,
  retrying,
  onRetry,
}: {
  source: string
  error: unknown
  hasData: boolean
  retrying: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation('dashboard')
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-control bg-muted p-4 text-sm"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{t('loadFailed', { source })}</p>
        <p className="break-words text-muted-foreground">
          {error instanceof ApiError ? error.message : t('unavailable')}
        </p>
        {hasData && <p className="text-xs text-muted-foreground">{t('refreshFailed')}</p>}
        {!hasData && isResourceDenied(error) && (
          <p className="text-xs text-muted-foreground">{t('resourceDenied')}</p>
        )}
      </div>
      <Button variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  )
}

function SourceFeedback<T>({
  state,
  source,
  denied,
}: {
  state: DashboardSourceState<T>
  source: string
  denied: string
}) {
  if (!state.allowed)
    return (
      <p role="status" className="py-5 text-sm text-muted-foreground">
        {denied}
      </p>
    )
  return (
    <>
      {state.isPending && <SectionSkeleton />}
      {state.isError && (
        <SourceFailure
          source={source}
          error={state.error}
          hasData={state.data !== undefined}
          retrying={state.isFetching}
          onRetry={state.retry}
        />
      )}
    </>
  )
}

function RangeControl({
  range,
  onRange,
}: {
  range: LogInsightRange
  onRange: (range: LogInsightRange) => void
}) {
  const { t } = useTranslation('dashboard')
  return (
    <div
      className="dashboard-sample-control flex flex-wrap gap-1 rounded-full p-1"
      role="group"
      aria-label={t('rangeSelector')}
    >
      {dashboardRanges.map((option) => (
        <button
          key={option}
          type="button"
          className="rounded-full px-3 py-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-pressed={option === range}
          onClick={() => onRange(option)}
        >
          {t(`range${option}`)}
        </button>
      ))}
    </div>
  )
}

function WindowNote({ insight }: { insight: LoginInsights | OperInsights }) {
  const { t } = useTranslation('dashboard')
  return (
    <div className="text-xs leading-relaxed text-muted-foreground">
      <p className="tabular-nums">{t('windowSpan', { from: insight.from, to: insight.to })}</p>
      <p className="mt-1">{t('windowZone', { zone: insight.zone, offset: insight.utcOffset })}</p>
    </div>
  )
}

function Comparison({ insight }: { insight: LoginInsights | OperInsights }) {
  const { t } = useTranslation('dashboard')
  const result = periodComparison(insight.total, insight.previousTotal, insight.previousCovered)
  if (result.direction === null)
    return <span className="text-xs text-muted-foreground">{t('compareUnavailable')}</span>
  const Icon =
    result.direction === 'up' ? ArrowUpRight : result.direction === 'down' ? ArrowDownRight : Minus
  return (
    <span
      className="dashboard-compare inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium"
      data-direction={result.direction}
      title={
        insight.previousCovered
          ? t('compareExact', { total: insight.total, previous: insight.previousTotal })
          : undefined
      }
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {result.multiple !== null
        ? t('compareMultiple', { multiple: result.multiple })
        : result.percent === null
          ? t(result.direction === 'same' ? 'compareSame' : 'compareNew')
          : t(`compare_${result.direction}`, { percent: result.percent })}
    </span>
  )
}

function PeriodTrend({
  insight,
  motionEnabled,
}: {
  insight: LoginInsights
  motionEnabled: boolean
}) {
  const { t } = useTranslation('dashboard')
  const id = useId()
  const [selected, setSelected] = useState<number | null>(null)
  const counts = bucketCounts(insight.buckets)
  const shape = trendPath(counts)
  const index = Math.min(selected ?? counts.length - 1, counts.length - 1)
  const point = shape?.points[index]
  const bucket = insight.buckets[index]
  const pointControls = useSurfaceAnimation(
    { cx: point?.x ?? 0, cy: point?.y ?? 0 },
    motionEnabled,
    insightMotion.chart,
  )
  if (!shape || !bucket || !point)
    return (
      <p
        role="status"
        className="flex min-h-44 items-center justify-center text-sm text-muted-foreground"
      >
        {t('noLoginRecords')}
      </p>
    )
  const { left, right, top, bottom, width, height } = trendGeometry
  const move = (event: KeyboardEvent<SVGSVGElement>) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    setSelected(Math.max(0, Math.min(counts.length - 1, index + delta)))
  }
  const labels = [0, Math.floor((counts.length - 1) / 2), counts.length - 1]
  // A new range redraws its curve once; same-range refreshes keep the drawn path.
  const drawKey = `${insight.range}-${counts.length}`
  return (
    <div className="min-w-0">
      <div
        className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span className="tabular-nums">{bucket.start.slice(5, 16)}</span>
        <span className="rounded-full bg-card/70 px-2 py-1 font-medium text-foreground">
          {t('bucketReadout', { total: bucket.total, failed: bucket.failed })}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="img"
        tabIndex={0}
        aria-label={t('trendLabel', { total: insight.total })}
        onKeyDown={move}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const fraction =
            (((event.clientX - bounds.left) / bounds.width) * width - left) / (right - left)
          setSelected(
            Math.max(0, Math.min(counts.length - 1, Math.round(fraction * (counts.length - 1)))),
          )
        }}
        onPointerLeave={() => setSelected(null)}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={left}
            x2={right}
            y1={top + (bottom - top) * fraction}
            y2={top + (bottom - top) * fraction}
            className="dashboard-trend-grid"
          />
        ))}
        {counts.length > 1 && (
          <>
            <motion.path
              key={`fill-${drawKey}`}
              d={shape.fill}
              fill={`url(#${id})`}
              initial={motionEnabled ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={insightMotion.chart}
            />
            <motion.path
              key={`line-${drawKey}`}
              d={shape.path}
              className="dashboard-trend-line"
              initial={motionEnabled ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={insightMotion.chart}
            />
            {shape.points.map((vertex, vertexIndex) => (
              <circle
                key={`${drawKey}-${vertexIndex}`}
                cx={vertex.x}
                cy={vertex.y}
                r={counts.length > 12 ? 1.6 : 2.6}
                className="dashboard-trend-vertex"
              />
            ))}
          </>
        )}
        <motion.circle
          initial={{ cx: point.x, cy: point.y }}
          animate={pointControls}
          r="4.5"
          className="dashboard-trend-point"
        />
      </svg>
      <div
        className="flex justify-between gap-4 text-xs text-muted-foreground tabular-nums"
        aria-hidden="true"
      >
        {labels.map((labelIndex, position) => (
          <span key={`${labelIndex}-${position}`}>
            {bucketLabel(insight.buckets[labelIndex].start, insight.bucketUnit)}
          </span>
        ))}
      </div>
    </div>
  )
}

function SuccessGauge({
  value,
  motionEnabled,
  language,
}: {
  value: number | null
  motionEnabled: boolean
  language: 'zh' | 'en'
}) {
  const { t } = useTranslation('dashboard')
  return (
    <div className="relative mx-auto my-4 aspect-square w-44 max-w-full">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden="true">
        {Array.from({ length: 60 }, (_, index) => {
          const angle = (index / 60) * Math.PI * 2
          return (
            <line
              key={index}
              x1={100 + Math.cos(angle) * 81}
              y1={100 + Math.sin(angle) * 81}
              x2={100 + Math.cos(angle) * 91}
              y2={100 + Math.sin(angle) * 91}
              className="dashboard-gauge-tick"
              data-active={value !== null && index < Math.round(value * 0.6)}
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <CircleCheck className="mb-1 size-5 text-brand-text" aria-hidden="true" />
        <div className="insight-metric text-4xl font-medium">
          {value === null ? (
            <span>—</span>
          ) : (
            <>
              <AnimatedNumber
                value={value}
                language={language}
                motionEnabled={motionEnabled}
                decimals={1}
                variant="odometer"
              />
              <span className="ml-0.5 text-xl text-muted-foreground">%</span>
            </>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {t(value === null ? 'rateUnavailable' : 'succeeded')}
        </span>
      </div>
    </div>
  )
}

function DistributionBar({
  value,
  total,
  index,
  motionEnabled,
}: {
  value: number
  total: number
  index: number
  motionEnabled: boolean
}) {
  const target = { width: `${total > 0 ? (value / total) * 100 : 0}%` }
  const controls = useSurfaceAnimation(target, motionEnabled, insightMotion.layout)
  return (
    <motion.div
      className="dashboard-distribution-bar h-full rounded-full"
      data-category={index}
      initial={target}
      animate={controls}
    />
  )
}

function Stat({
  label,
  value,
  language,
  motionEnabled,
  decimals = 0,
  tone,
}: {
  label: string
  value: number
  language: 'zh' | 'en'
  motionEnabled: boolean
  decimals?: number
  tone?: 'brand'
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1.5 text-lg font-medium tabular-nums ${tone === 'brand' ? 'text-brand-text' : ''}`}
      >
        <AnimatedNumber
          value={value}
          language={language}
          motionEnabled={motionEnabled}
          decimals={decimals}
          variant="odometer"
        />
      </dd>
    </div>
  )
}

export function DashboardInsights({
  login,
  operation,
  online,
  range,
  onRange,
  motionEnabled,
  language,
  loginHref,
  operationHref,
  onlineHref,
  children,
}: {
  login: DashboardSourceState<LoginInsights>
  operation: DashboardSourceState<OperInsights>
  online: DashboardSourceState<OnlineUserRow[]>
  range: LogInsightRange
  onRange: (range: LogInsightRange) => void
  motionEnabled: boolean
  language: 'zh' | 'en'
  loginHref?: string
  operationHref?: string
  onlineHref?: string
  children: ReactNode
}) {
  const { t } = useTranslation('dashboard')
  const insight = login.data
  const operations = operation.data
  const categories = operations?.byBusinessType.slice(0, 4) ?? []
  const remainder = operations?.byBusinessType.slice(4) ?? []
  const distributionRows = [
    ...categories.map((item) => ({ ...item, kind: 'type' as const })),
    ...(remainder.length
      ? [
          {
            kind: 'remaining' as const,
            type: null,
            count: remainder.reduce((sum, item) => sum + item.count, 0),
          },
        ]
      : []),
  ]
  const formatNumber = new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US')
  const noOperation = !operation.allowed
    ? t('noOperationAccess')
    : operation.isPending
      ? t('loading')
      : operation.isError && !operations
        ? t('unavailable')
        : t('noOperationRecords')
  return (
    <div className="space-y-4">
      <div className="dashboard-insight-top grid gap-4">
        <InsightCard
          className="dashboard-insight-hero flex flex-col p-5 sm:p-7"
          motionEnabled={motionEnabled}
          entranceKey="dashboard:login"
          order={0}
          aria-labelledby="dashboard-logins-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="dashboard-logins-title" className="font-semibold">
                {t('loginOverview')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{t('loginOverviewHint')}</p>
            </div>
            <RangeControl range={range} onRange={onRange} />
          </div>
          <div className="mt-5">
            <SourceFeedback state={login} source={t('loginSource')} denied={t('noLoginAccess')} />
          </div>
          {insight && (
            <>
              <div className="grid items-start gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <div>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="insight-metric text-5xl font-medium sm:text-6xl">
                        <AnimatedNumber
                          value={insight.total}
                          language={language}
                          motionEnabled={motionEnabled}
                          variant="odometer"
                        />
                      </span>
                      <span className="text-xs text-muted-foreground">{t('times')}</span>
                      <Comparison insight={insight} />
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {t(`rangeTotal${insight.range}`)}
                    </p>
                  </div>
                </div>
                <PeriodTrend insight={insight} motionEnabled={motionEnabled} />
              </div>
              <dl className="mt-6 grid grid-cols-3 gap-x-6 gap-y-4 border-t border-border-subtle pt-5 text-xs sm:grid-cols-6">
                <Stat
                  label={t('succeeded')}
                  value={insight.succeeded}
                  language={language}
                  motionEnabled={motionEnabled}
                  tone="brand"
                />
                <Stat
                  label={t('failed')}
                  value={insight.failed}
                  language={language}
                  motionEnabled={motionEnabled}
                />
                <Stat
                  label={t('distinctUsers')}
                  value={insight.distinctUsers}
                  language={language}
                  motionEnabled={motionEnabled}
                />
                <Stat
                  label={t('distinctIps')}
                  value={insight.distinctIps}
                  language={language}
                  motionEnabled={motionEnabled}
                />
                <Stat
                  label={t(insight.bucketUnit === 'HOURS' ? 'peakHour' : 'peakDay')}
                  value={insight.peak}
                  language={language}
                  motionEnabled={motionEnabled}
                />
                <Stat
                  label={t(insight.bucketUnit === 'HOURS' ? 'averageHour' : 'averageDay')}
                  value={insight.average}
                  language={language}
                  motionEnabled={motionEnabled}
                  decimals={1}
                />
              </dl>
              <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-6">
                <WindowNote insight={insight} />
                {loginHref && (
                  <Button className="dashboard-insight-action rounded-full" asChild>
                    <Link to={loginHref}>
                      {t('viewLogin')}
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </Button>
                )}
              </div>
            </>
          )}
        </InsightCard>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <InsightCard
            className="flex flex-col justify-between gap-4 p-5 sm:p-6"
            motionEnabled={motionEnabled}
            entranceKey="dashboard:online"
            order={1}
            aria-labelledby="dashboard-sessions-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="dashboard-sessions-title" className="text-sm font-medium">
                  {t('online')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">{t('onlineHint')}</p>
              </div>
              <MonitorDot className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
            <SourceFeedback state={online} source={t('online')} denied={t('noOnlineAccess')} />
            {online.data !== undefined && (
              <div data-slot="session-count">
                <p className="insight-metric text-4xl font-medium sm:text-5xl">
                  <AnimatedNumber
                    value={online.data.length}
                    language={language}
                    motionEnabled={motionEnabled}
                    variant="odometer"
                  />
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {online.data.length
                    ? t('sessions', { count: online.data.length })
                    : t('noSessions')}
                </p>
              </div>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">{t('onlineDefinition')}</p>
            {onlineHref && online.allowed && (
              <Button variant="ghost" size="sm" className="self-start" asChild>
                <Link to={onlineHref}>
                  {t('manageSessions')}
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            )}
          </InsightCard>
          <InsightCard
            className="flex flex-col justify-between gap-4 p-5 sm:p-6"
            motionEnabled={motionEnabled}
            entranceKey="dashboard:operations"
            order={2}
            aria-labelledby="dashboard-operations-title"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="dashboard-operations-title" className="text-sm font-medium">
                {t('operationsInRange')}
              </h2>
              <ScrollText className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <SourceFeedback
              state={operation}
              source={t('operationSource')}
              denied={t('noOperationAccess')}
            />
            {operations && (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="insight-metric text-4xl font-medium sm:text-5xl">
                    <AnimatedNumber
                      value={operations.total}
                      language={language}
                      motionEnabled={motionEnabled}
                      variant="odometer"
                    />
                  </span>
                  <Comparison insight={operations} />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(`operationsTotal${operations.range}`)}
                </p>
              </>
            )}
            {operationHref && operation.allowed && (
              <Button variant="ghost" size="sm" className="self-start" asChild>
                <Link to={operationHref}>
                  {t('viewOperations')}
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            )}
          </InsightCard>
        </div>
      </div>
      <div className="dashboard-insight-bottom grid gap-4 md:grid-cols-2">
        <InsightCard
          className="p-5 sm:p-6"
          motionEnabled={motionEnabled}
          entranceKey="dashboard:success"
          order={3}
        >
          <h2 className="font-semibold">{t('operationSuccess')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('operationSuccessHint')}</p>
          {operations && operations.total > 0 ? (
            <>
              <SuccessGauge
                value={operations.successRate}
                language={language}
                motionEnabled={motionEnabled}
              />
              <dl className="grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 text-xs">
                <Stat
                  label={t('succeeded')}
                  value={operations.succeeded}
                  language={language}
                  motionEnabled={motionEnabled}
                />
                <Stat
                  label={t('failed')}
                  value={operations.failed}
                  language={language}
                  motionEnabled={motionEnabled}
                />
              </dl>
              {operations.unknown > 0 && (
                <p className="mt-2 text-xs text-warning-foreground">
                  {t('unknownResults', { count: operations.unknown })}
                </p>
              )}
            </>
          ) : (
            <p role="status" className="py-10 text-sm text-muted-foreground">
              {noOperation}
            </p>
          )}
        </InsightCard>
        <InsightCard
          className="flex flex-col p-5 sm:p-6"
          motionEnabled={motionEnabled}
          entranceKey="dashboard:distribution"
          order={4}
        >
          <h2 className="font-semibold">{t('distribution')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('distributionHint')}</p>
          {operations && operations.total > 0 ? (
            <div className="my-6 flex flex-1 flex-col justify-center gap-5">
              {distributionRows.map((item, index) => {
                const knownKey = operationTypeKey(item.type)
                const label =
                  item.kind === 'remaining'
                    ? t('typeOther')
                    : knownKey
                      ? t(knownKey)
                      : (item.type ?? t('typeUnknown'))
                return (
                  <div key={item.kind === 'remaining' ? 'remaining' : `type-${item.type}`}>
                    <div className="mb-2 flex items-start justify-between gap-3 text-xs">
                      <span
                        className="min-w-0 break-all"
                        title={
                          item.kind === 'remaining'
                            ? remainder.map((entry) => entry.type ?? t('typeUnknown')).join(', ')
                            : (item.type ?? undefined)
                        }
                      >
                        {label}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {formatNumber.format(item.count)} ·{' '}
                        {Math.round((item.count / operations.total) * 100)}%
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-secondary"
                      role="meter"
                      aria-label={label}
                      aria-valuemin={0}
                      aria-valuemax={operations.total}
                      aria-valuenow={item.count}
                    >
                      <DistributionBar
                        value={item.count}
                        total={operations.total}
                        index={index}
                        motionEnabled={motionEnabled}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p role="status" className="py-10 text-sm text-muted-foreground">
              {noOperation}
            </p>
          )}
        </InsightCard>
        <div className="min-w-0 md:col-span-2 xl:col-span-1">{children}</div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('rangeExplanation')}</p>
    </div>
  )
}
