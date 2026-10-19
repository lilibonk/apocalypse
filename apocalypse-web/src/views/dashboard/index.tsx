/**
 * Task-oriented dashboard. Escapes DynaLayer because independent read-only sources feed
 * bounded sample visualizations; every source and detail remains guarded by current access.
 */
import type { UseQueryResult } from '@tanstack/react-query'
import { ArrowUpRight, LogIn, RefreshCw, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BrandHero } from '@/components/BrandHero'
import { InsightCard } from '@/components/insights/InsightCard'
import { resolveMenuIcon } from '@/components/layout/menu-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMenuTitle } from '@/hooks/useMenuTitle'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { isResourceDenied } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { resolvePageComponent } from '@/routes/component-map'
import { flattenMenuRoutes } from '@/routes/menu-routes'
import { useAuthStore } from '@/stores/auth'

import {
  DashboardInsights,
  SectionSkeleton,
  SourceFailure,
  type DashboardSourceState,
} from './dashboard-insights'
import { DASHBOARD_ACTIVITY_LIMIT, operationTypeKey } from './dashboard-insights.model'
import {
  commonTaskRoutes,
  readableQueryData,
  recentActivity,
  routeComponent,
  type RecentActivity,
} from './dashboard-model'
import { useCarriedValue, useDashboardInsights, useDashboardSources } from './dashboard.queries'
import type { LogInsightRange } from '@/views/system/log/log-insight.api'
import { MobileDashboard } from './MobileDashboard'

function visibleSource<T>(
  query: UseQueryResult<T, Error> & { allowed: boolean },
): DashboardSourceState<T> {
  return {
    allowed: query.allowed,
    data: readableQueryData(query.allowed, query),
    error: query.error,
    isError: query.isError,
    isPending: query.isPending,
    isFetching: query.isFetching,
    retry: () => {
      void query.refetch()
    },
  }
}

interface ActivitySelection {
  kind: 'login' | 'operation'
  id: string
}

interface ActivityDetailState {
  context: string
  selection: ActivitySelection | null
  open: boolean
}

export default function DashboardPage() {
  const desktop = useDesktopViewport()
  return desktop ? <DesktopDashboard /> : <MobileDashboard />
}

function DesktopDashboard() {
  const { t, i18n } = useTranslation('dashboard')
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh'
  const motionEnabled = useMotionPreference()
  const menuTitle = useMenuTitle()
  const user = useAuthStore((state) => state.user)
  const menus = useAuthStore((state) => state.menus)
  const meLoaded = useAuthStore((state) => state.meLoaded)
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const [range, setRange] = useState<LogInsightRange>('DAY')
  const queries = useDashboardSources(DASHBOARD_ACTIVITY_LIMIT)
  const insights = useDashboardInsights(range)
  const login = visibleSource(queries.login)
  const operation = visibleSource(queries.operation)
  const online = visibleSource(queries.online)
  const insightContext = `${sessionEpoch}:${user?.id ?? ''}:${meLoaded}`
  const loginInsightSource = visibleSource(insights.login)
  const operationInsightSource = visibleSource(insights.operation)
  const loginCarried = useCarriedValue(
    loginInsightSource.data,
    loginInsightSource.allowed && loginInsightSource.isPending,
    `${insightContext}:${loginInsightSource.allowed}`,
  )
  const loginInsights = {
    ...loginInsightSource,
    data: loginCarried,
    isPending: loginInsightSource.isPending && loginCarried === undefined,
  }
  const operationCarried = useCarriedValue(
    operationInsightSource.data,
    operationInsightSource.allowed && operationInsightSource.isPending,
    `${insightContext}:${operationInsightSource.allowed}`,
  )
  const operationInsights = {
    ...operationInsightSource,
    data: operationCarried,
    isPending: operationInsightSource.isPending && operationCarried === undefined,
  }
  const routes = useMemo(
    () =>
      flattenMenuRoutes(menus).filter((route) =>
        resolvePageComponent(route.component, route.moduleKey),
      ),
    [menus],
  )
  const tasks = commonTaskRoutes(routes)
  const loginRoute = routes.find((route) => routeComponent(route) === 'system/log/login')
  const operationRoute = routes.find((route) => routeComponent(route) === 'system/log/oper')
  const onlineRoute = routes.find((route) => routeComponent(route) === 'system/online')
  const auditRoute =
    operation.allowed && operationRoute ? operationRoute : login.allowed ? loginRoute : undefined
  const activity = recentActivity(login.data?.list, operation.data?.list)
  const loadingActivity =
    (login.allowed && login.isPending) || (operation.allowed && operation.isPending)
  const activityFailed =
    (login.allowed && login.isError) || (operation.allowed && operation.isError)
  const hasAuditAccess = login.allowed || operation.allowed
  const name = user?.nickname || user?.username

  const detailContext = JSON.stringify([
    sessionEpoch,
    user?.id,
    meLoaded,
    login.allowed,
    operation.allowed,
    isResourceDenied(login.error),
    isResourceDenied(operation.error),
  ])
  const [detail, setDetail] = useState<ActivityDetailState>(() => ({
    context: detailContext,
    selection: null,
    open: false,
  }))
  // Keep only identity in local state. A changed authorization context cannot preserve a
  // sensitive row for an exit animation or reopen it when permission later returns.
  if (detail.context !== detailContext)
    setDetail({ context: detailContext, selection: null, open: false })
  const selected = detail.context === detailContext ? detail.selection : null
  let selectedActivity: RecentActivity | null = null
  if (selected?.kind === 'login') {
    const row = login.data?.list.find((entry) => entry.id === selected.id)
    if (row) selectedActivity = { kind: 'login', id: `login-${row.id}`, time: row.loginTime, row }
  } else if (selected?.kind === 'operation') {
    const row = operation.data?.list.find((entry) => entry.id === selected.id)
    if (row)
      selectedActivity = { kind: 'operation', id: `operation-${row.id}`, time: row.operTime, row }
  }
  if (detail.context === detailContext && detail.open && detail.selection && !selectedActivity) {
    setDetail({ context: detailContext, selection: null, open: false })
  }

  const resultLabel = (item: RecentActivity) => {
    const value = item.kind === 'login' ? item.row.success : item.row.status
    return t(value === 1 ? 'succeeded' : value === 0 ? 'failed' : 'unknownStatus')
  }
  const activityTitle = (item: RecentActivity) =>
    item.kind === 'login'
      ? t(
          item.row.success === 1
            ? 'loginSuccess'
            : item.row.success === 0
              ? 'loginFailure'
              : 'unknownStatus',
        )
      : item.row.title || t('operation')

  return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="insight-eyebrow">{t('title')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {name ? t('welcome', { name }) : t('welcomeAnonymous')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {(login.allowed || operation.allowed || online.allowed) && (
          <Button
            variant="outline"
            size="sm"
            disabled={
              login.isFetching ||
              operation.isFetching ||
              online.isFetching ||
              loginInsights.isFetching ||
              operationInsights.isFetching
            }
            onClick={() => {
              if (login.allowed) {
                login.retry()
                loginInsights.retry()
              }
              if (operation.allowed) {
                operation.retry()
                operationInsights.retry()
              }
              if (online.allowed) online.retry()
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {t('refresh')}
          </Button>
        )}
      </header>

      <DashboardInsights
        login={loginInsights}
        operation={operationInsights}
        online={online}
        range={range}
        onRange={setRange}
        motionEnabled={motionEnabled}
        language={language}
        loginHref={login.allowed ? loginRoute?.path : undefined}
        operationHref={operation.allowed ? operationRoute?.path : undefined}
        onlineHref={online.allowed ? onlineRoute?.path : undefined}
      >
        <InsightCard
          className="flex h-full min-w-0 flex-col p-5 sm:p-6"
          motionEnabled={motionEnabled}
          entranceKey="dashboard:activity"
          order={5}
          aria-labelledby="dashboard-activity-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="dashboard-activity-title" className="font-semibold">
                {t('activity')}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t('activityHint')}
              </p>
            </div>
            {auditRoute && hasAuditAccess && (
              <Button variant="ghost" size="xs" asChild>
                <Link to={auditRoute.path}>
                  {t('viewAll')}
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
          {!hasAuditAccess && (
            <p role="status" className="py-8 text-sm text-muted-foreground">
              {t('noAuditAccess')}
            </p>
          )}
          {loadingActivity && <SectionSkeleton />}
          {hasAuditAccess && !loadingActivity && !activityFailed && activity.length === 0 && (
            <div role="status" className="space-y-1 py-8 text-center">
              <p className="text-sm font-medium">{t('noActivity')}</p>
              <p className="text-xs text-muted-foreground">{t('noActivityHint')}</p>
            </div>
          )}
          {(
            [
              [login, t('loginSource')],
              [operation, t('operationSource')],
            ] as const
          ).map(
            ([source, label]) =>
              source.allowed &&
              source.isError && (
                <div key={label} className="mt-3">
                  <SourceFailure
                    source={label}
                    error={source.error}
                    hasData={source.data !== undefined}
                    retrying={source.isFetching}
                    onRetry={source.retry}
                  />
                </div>
              ),
          )}
          <ul className="mt-3 flex-1 divide-y divide-border-subtle">
            {activity.map((item) => {
              const success = item.kind === 'login' ? item.row.success === 1 : item.row.status === 1
              const Icon = item.kind === 'login' ? LogIn : ScrollText
              const title = activityTitle(item)
              const actor =
                item.kind === 'login' ? item.row.username : item.row.operName || t('unknownUser')
              const ip = item.kind === 'login' ? item.row.ip : item.row.operIp
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 rounded-control py-3 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t('inspectActivity', { title })}
                    onClick={() =>
                      setDetail({
                        context: detailContext,
                        selection: { kind: item.kind, id: item.row.id },
                        open: true,
                      })
                    }
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-muted text-brand-text">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words text-xs font-medium">{title}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            success ? 'text-success-foreground' : 'text-destructive',
                          )}
                        >
                          {resultLabel(item)}
                        </Badge>
                      </span>
                      <span className="block break-words text-xs text-muted-foreground">
                        {actor} · {ip || t('unknownIp')}
                      </span>
                      <time
                        dateTime={item.time.replace(' ', 'T')}
                        className="block text-xs text-muted-foreground tabular-nums"
                      >
                        {item.time.replace('T', ' ').slice(0, 16)}
                      </time>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {hasAuditAccess && (
            <p className="mt-3 border-t border-border-subtle pt-3 text-xs leading-relaxed text-muted-foreground">
              {t('activityScope')}
            </p>
          )}
        </InsightCard>
      </DashboardInsights>

      <section aria-labelledby="dashboard-tasks-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dashboard-tasks-title" className="text-base font-semibold">
            {t('commonTasks')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('commonTasksHint')}</p>
        </div>
        <div data-slot="dashboard-tasks" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((route) => {
            const Icon = resolveMenuIcon(route.icon)
            return (
              <Link
                key={route.path}
                to={route.path}
                data-slot="interactive-card"
                className="flex min-w-0 items-center gap-3 rounded-panel border border-border bg-card p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-brand-text">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{menuTitle(route.title)}</span>
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            )
          })}
        </div>
        {tasks.length === 0 && (
          <p
            role="status"
            className="rounded-panel border border-border bg-card p-5 text-sm text-muted-foreground"
          >
            {t('noTasks')}
          </p>
        )}
      </section>

      <BrandHero alt={t('brandHeroAlt')} />

      {selectedActivity && (
        <Dialog
          open={detail.open}
          onOpenChange={(open) => setDetail((current) => ({ ...current, open }))}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('details')}</DialogTitle>
              <DialogDescription>{t('detailsHint')}</DialogDescription>
            </DialogHeader>
            <p className="break-words text-base font-medium">{activityTitle(selectedActivity)}</p>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t('actor')}</dt>
                <dd className="mt-1 break-words">
                  {selectedActivity.kind === 'login'
                    ? selectedActivity.row.username
                    : selectedActivity.row.operName || t('unknownUser')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('result')}</dt>
                <dd className="mt-1">{resultLabel(selectedActivity)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('recordedTime')}</dt>
                <dd className="mt-1 tabular-nums">{selectedActivity.time.replace('T', ' ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('address')}</dt>
                <dd className="mt-1 break-all">
                  {(selectedActivity.kind === 'login'
                    ? selectedActivity.row.ip
                    : selectedActivity.row.operIp) || t('unknownIp')}
                </dd>
              </div>
              {selectedActivity.kind === 'operation' && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">{t('businessType')}</dt>
                  <dd className="mt-1 break-words">
                    {operationTypeKey(selectedActivity.row.businessType)
                      ? t(operationTypeKey(selectedActivity.row.businessType)!)
                      : selectedActivity.row.businessType || t('typeUnknown')}
                  </dd>
                  <dd className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {selectedActivity.row.businessType}
                  </dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">{t('message')}</dt>
                <dd className="mt-1 break-words">
                  {(selectedActivity.kind === 'login'
                    ? selectedActivity.row.message
                    : selectedActivity.row.errorMsg) || t('missingValue')}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">{t('recordId')}</dt>
                <dd className="mt-1 break-all font-mono text-xs">{selectedActivity.row.id}</dd>
              </div>
            </dl>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t('close')}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
