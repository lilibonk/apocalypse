import { useId, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight, CircleAlert, CircleCheck, LogIn, MonitorDot, ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { AnimatedNumber } from '@/components/insights/AnimatedNumber'
import { InsightCard } from '@/components/insights/InsightCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { insightMotion } from '@/design/motion'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'
import { ApiError } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import { isResourceDenied } from '@/lib/query/use-resource-denial'
import type { LoginLogRow } from '@/views/system/log/login/login-log.api'
import type { OperLogRow } from '@/views/system/log/oper/oper-log.api'
import type { OnlineUserRow } from '@/views/system/online/online.api'

import {
  dashboardSampleSizes,
  loginTrendPath,
  operationTypeKey,
  retainedTotal,
  trendGeometry,
  type DashboardSampleSize,
  type LoginSample,
  type OperationSample,
  type SampleCoverage,
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

function SampleSpan({ value, count }: { value: SampleCoverage; count: number }) {
  const { t } = useTranslation('dashboard')
  return (
    <div className="text-xs leading-relaxed text-muted-foreground">
      <p>{t('sampleCount', { count })}</p>
      {value.first && value.last && (
        <p className="mt-1 break-words tabular-nums">
          {t('sampleCoverage', { first: value.first, last: value.last })}
        </p>
      )}
      <p className="mt-1">{t('sampleClock')}</p>
    </div>
  )
}

function LoginTrend({ sample, motionEnabled }: { sample: LoginSample; motionEnabled: boolean }) {
  const { t } = useTranslation('dashboard')
  const id = useId()
  const [hovered, setHovered] = useState<number | null>(null)
  const shape = loginTrendPath(sample.buckets)
  const selected = Math.min(hovered ?? sample.buckets.length - 1, sample.buckets.length - 1)
  const bucket = sample.buckets[selected]
  const { left, right, top, bottom, width, height } = trendGeometry
  const x =
    sample.buckets.length === 1
      ? width / 2
      : left + ((right - left) * selected) / (sample.buckets.length - 1)
  const y = bottom - ((bucket?.count ?? 0) / (shape?.maximum ?? 1)) * (bottom - top)
  const lineControls = useSurfaceAnimation(
    { d: shape?.path ?? '' },
    motionEnabled,
    insightMotion.chart,
  )
  const fillControls = useSurfaceAnimation(
    { d: shape?.fill ?? '' },
    motionEnabled,
    insightMotion.chart,
  )
  const pointControls = useSurfaceAnimation({ cx: x, cy: y }, motionEnabled, insightMotion.chart)
  if (!shape || !bucket)
    return (
      <p
        role="status"
        className="flex min-h-44 items-center justify-center text-sm text-muted-foreground"
      >
        {t(sample.count ? 'invalidTimeOnly' : 'noLoginSamples')}
      </p>
    )
  return (
    <div className="min-w-0 self-end">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{bucket.start.slice(5)}</span>
        <span className="rounded-full bg-card/70 px-2 py-1 font-medium text-foreground">
          {t('bucketRecords', { count: bucket.count })}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`${t('loginTrend')}: ${t('sampleCount', { count: sample.count - sample.coverage.invalidTimes })}`}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const fraction =
            (((event.clientX - bounds.left) / bounds.width) * width - left) / (right - left)
          setHovered(
            Math.max(
              0,
              Math.min(
                sample.buckets.length - 1,
                Math.round(fraction * (sample.buckets.length - 1)),
              ),
            ),
          )
        }}
        onPointerLeave={() => setHovered(null)}
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
        {sample.buckets.length > 1 && (
          <>
            <motion.path
              key={`fill-${sample.buckets.length}`}
              initial={{ d: shape.fill }}
              animate={fillControls}
              fill={`url(#${id})`}
            />
            <motion.path
              key={`line-${sample.buckets.length}`}
              initial={{ d: shape.path }}
              animate={lineControls}
              className="dashboard-trend-line"
            />
          </>
        )}
        <motion.circle
          initial={{ cx: x, cy: y }}
          animate={pointControls}
          r="4"
          className="dashboard-trend-point"
        />
      </svg>
      <div
        className="flex justify-between gap-4 text-xs text-muted-foreground tabular-nums"
        aria-hidden="true"
      >
        <span>{sample.coverage.first?.slice(5, 16)}</span>
        <span>{sample.coverage.last?.slice(5, 16)}</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {t(sample.buckets.length === 1 ? 'singleObservation' : 'chartHint')}
      </p>
      {sample.coverage.invalidTimes > 0 && (
        <p className="mt-2 text-xs text-warning-foreground">
          {t('invalidTimes', { count: sample.coverage.invalidTimes })}
        </p>
      )}
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

export function DashboardInsights({
  login,
  operation,
  online,
  loginSample,
  operationSample,
  sampleSize,
  onSampleSize,
  motionEnabled,
  language,
  loginHref,
  operationHref,
  onlineHref,
  children,
}: {
  login: DashboardSourceState<PageResult<LoginLogRow>>
  operation: DashboardSourceState<PageResult<OperLogRow>>
  online: DashboardSourceState<OnlineUserRow[]>
  loginSample: LoginSample | null
  operationSample: OperationSample | null
  sampleSize: DashboardSampleSize
  onSampleSize: (size: DashboardSampleSize) => void
  motionEnabled: boolean
  language: 'zh' | 'en'
  loginHref?: string
  operationHref?: string
  onlineHref?: string
  children: ReactNode
}) {
  const { t } = useTranslation('dashboard')
  const loginTotal = retainedTotal(login.data?.total)
  const operationTotal = retainedTotal(operation.data?.total)
  const categories = operationSample?.distribution.slice(0, 4) ?? []
  const remainder = operationSample?.distribution.slice(4) ?? []
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
      : operation.isError && !operation.data
        ? t('unavailable')
        : t('noOperationSamples')
  return (
    <div className="space-y-4">
      <div className="dashboard-insight-top grid gap-4">
        <InsightCard
          className="dashboard-insight-hero flex flex-col p-5 sm:p-7"
          motionEnabled={motionEnabled}
          order={0}
          aria-labelledby="dashboard-logins-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="dashboard-logins-title" className="font-semibold">
                {t('loginOverview')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{t('retainedLoginHint')}</p>
            </div>
            <div
              className="dashboard-sample-control flex flex-wrap gap-1 rounded-full p-1"
              role="group"
              aria-label={t('sampleSelector')}
            >
              {dashboardSampleSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  className="rounded-full px-3 py-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-pressed={size === sampleSize}
                  onClick={() => onSampleSize(size)}
                >
                  {t('sampleOption', { count: size })}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5">
            <SourceFeedback state={login} source={t('loginSource')} denied={t('noLoginAccess')} />
          </div>
          {login.data !== undefined && loginSample && (
            <>
              <div className="grid flex-1 items-end gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-6">
                  <div>
                    <div className="flex flex-wrap items-baseline gap-2">
                      {loginTotal === null ? (
                        <p className="text-sm text-muted-foreground">{t('totalUnavailable')}</p>
                      ) : (
                        <>
                          <span className="insight-metric text-5xl font-medium sm:text-6xl">
                            <AnimatedNumber
                              value={loginTotal}
                              language={language}
                              motionEnabled={motionEnabled}
                            />
                          </span>
                          <span className="text-xs text-muted-foreground">{t('records')}</span>
                        </>
                      )}
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {t('retainedHint')}
                    </p>
                  </div>
                  <dl className="flex flex-wrap gap-6 text-xs">
                    <div>
                      <dt className="text-muted-foreground">{t('sampleSucceeded')}</dt>
                      <dd className="mt-1.5 text-lg font-medium text-brand-text tabular-nums">
                        <AnimatedNumber
                          value={loginSample.succeeded}
                          language={language}
                          motionEnabled={motionEnabled}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('sampleFailed')}</dt>
                      <dd className="mt-1.5 text-lg font-medium tabular-nums">
                        <AnimatedNumber
                          value={loginSample.failed}
                          language={language}
                          motionEnabled={motionEnabled}
                        />
                      </dd>
                    </div>
                  </dl>
                </div>
                <LoginTrend sample={loginSample} motionEnabled={motionEnabled} />
              </div>
              <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                <SampleSpan value={loginSample.coverage} count={loginSample.count} />
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
            order={2}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">{t('retainedOperations')}</h2>
              <ScrollText className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <SourceFeedback
              state={operation}
              source={t('operationSource')}
              denied={t('noOperationAccess')}
            />
            {operation.data !== undefined && (
              <>
                <div className="insight-metric text-4xl font-medium sm:text-5xl">
                  {operationTotal === null ? (
                    <span className="text-sm text-muted-foreground">{t('totalUnavailable')}</span>
                  ) : (
                    <AnimatedNumber
                      value={operationTotal}
                      language={language}
                      motionEnabled={motionEnabled}
                    />
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('retainedHint')}</p>
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
        <InsightCard className="p-5 sm:p-6" motionEnabled={motionEnabled} order={3}>
          <h2 className="font-semibold">{t('operationSuccess')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('operationSuccessHint')}</p>
          {operationSample ? (
            <>
              <SuccessGauge
                value={operationSample.successRate}
                language={language}
                motionEnabled={motionEnabled}
              />
              <dl className="grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t('succeeded')}</dt>
                  <dd className="mt-1 text-lg font-medium tabular-nums">
                    <AnimatedNumber
                      value={operationSample.succeeded}
                      language={language}
                      motionEnabled={motionEnabled}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('failed')}</dt>
                  <dd className="mt-1 text-lg font-medium tabular-nums">
                    <AnimatedNumber
                      value={operationSample.failed}
                      language={language}
                      motionEnabled={motionEnabled}
                    />
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('sampleCount', { count: operationSample.count })}
              </p>
              {operationSample.unknown > 0 && (
                <p className="mt-2 text-xs text-warning-foreground">
                  {t('unknownResults', { count: operationSample.unknown })}
                </p>
              )}
            </>
          ) : (
            <p role="status" className="py-10 text-sm text-muted-foreground">
              {noOperation}
            </p>
          )}
        </InsightCard>
        <InsightCard className="flex flex-col p-5 sm:p-6" motionEnabled={motionEnabled} order={4}>
          <h2 className="font-semibold">{t('distribution')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('distributionHint')}</p>
          {operationSample?.count ? (
            <>
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
                          {Math.round((item.count / operationSample.count) * 100)}%
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-secondary"
                        role="meter"
                        aria-label={label}
                        aria-valuemin={0}
                        aria-valuemax={operationSample.count}
                        aria-valuenow={item.count}
                      >
                        <DistributionBar
                          value={item.count}
                          total={operationSample.count}
                          index={index}
                          motionEnabled={motionEnabled}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <SampleSpan value={operationSample.coverage} count={operationSample.count} />
            </>
          ) : (
            <p role="status" className="py-10 text-sm text-muted-foreground">
              {noOperation}
            </p>
          )}
        </InsightCard>
        <div className="min-w-0 md:col-span-2 xl:col-span-1">{children}</div>
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <LogIn className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t('sampleExplanation')}
      </p>
    </div>
  )
}
