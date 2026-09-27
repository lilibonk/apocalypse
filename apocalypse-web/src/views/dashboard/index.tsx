/**
 * Task-oriented dashboard. Escapes DynaLayer because it combines independent read-only sources,
 * while every entry and activity record remains bounded by the current account's permissions.
 */

import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, CircleAlert, LogIn, MonitorDot, ScrollText } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { resolveMenuIcon } from '@/components/layout/menu-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMenuTitle } from '@/hooks/useMenuTitle'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { resolvePageComponent } from '@/routes/component-map'
import { flattenMenuRoutes } from '@/routes/menu-routes'
import { useAuthStore } from '@/stores/auth'
import { pageLoginLogs } from '@/views/system/log/login/login-log.api'
import { pageOperLogs } from '@/views/system/log/oper/oper-log.api'
import { listOnlineUsers } from '@/views/system/online/online.api'

import {
  commonTaskRoutes,
  readableQueryData,
  recentActivity,
  routeComponent,
} from './dashboard-model'

function SectionSkeleton() {
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

function SourceFailure({
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
    <div role="alert" className="flex items-start gap-3 rounded-lg bg-muted p-4 text-sm">
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

export default function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const menuTitle = useMenuTitle()
  const user = useAuthStore((state) => state.user)
  const perms = useAuthStore((state) => state.perms)
  const menus = useAuthStore((state) => state.menus)
  const meLoaded = useAuthStore((state) => state.meLoaded)
  const routes = useMemo(
    () =>
      flattenMenuRoutes(menus).filter((route) =>
        resolvePageComponent(route.component, route.moduleKey),
      ),
    [menus],
  )
  const tasks = commonTaskRoutes(routes)
  const canReadLogin = meLoaded && perms.includes('system:log:login')
  const canReadOperation = meLoaded && perms.includes('system:log:oper')
  const canReadOnline = meLoaded && perms.includes('system:online:list')

  const loginQuery = useQuery({
    queryKey: ['dashboard', 'login-logs'],
    queryFn: () => pageLoginLogs(1, 4),
    enabled: canReadLogin,
  })
  const operQuery = useQuery({
    queryKey: ['dashboard', 'oper-logs'],
    queryFn: () => pageOperLogs(1, 4),
    enabled: canReadOperation,
  })
  const onlineQuery = useQuery({
    queryKey: ['dashboard', 'online-users'],
    queryFn: listOnlineUsers,
    enabled: canReadOnline,
  })

  const logins = readableQueryData(canReadLogin, loginQuery)
  const operations = readableQueryData(canReadOperation, operQuery)
  const online = readableQueryData(canReadOnline, onlineQuery)
  const activity = recentActivity(logins?.list, operations?.list)
  const loadingActivity =
    (canReadLogin && loginQuery.isPending) || (canReadOperation && operQuery.isPending)
  const activityFailed =
    (canReadLogin && loginQuery.isError) || (canReadOperation && operQuery.isError)
  const hasAuditAccess = canReadLogin || canReadOperation
  const auditRoute = routes.find((route) =>
    ['system/log/oper', 'system/log/login'].includes(routeComponent(route)),
  )
  const onlineRoute = routes.find((route) => routeComponent(route) === 'system/online')
  const name = user?.nickname || user?.username

  return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{t('title')}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {name ? t('welcome', { name }) : t('welcomeAnonymous')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

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

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <section
          aria-labelledby="dashboard-activity-title"
          className="min-w-0 rounded-panel border border-border bg-card xl:col-span-2"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:px-5">
            <div className="space-y-1">
              <h2 id="dashboard-activity-title" className="text-base font-semibold">
                {t('activity')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('activityHint')}</p>
            </div>
            {auditRoute && hasAuditAccess && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={auditRoute.path}>
                  {t('viewAll')}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
          <div className="px-4 sm:px-5">
            {!hasAuditAccess && (
              <p role="status" className="py-8 text-sm text-muted-foreground">
                {t('noAuditAccess')}
              </p>
            )}
            {(canReadLogin && loginQuery.isError) || (canReadOperation && operQuery.isError) ? (
              <div className="space-y-3 py-4">
                {canReadLogin && loginQuery.isError && (
                  <SourceFailure
                    source={t('loginSource')}
                    error={loginQuery.error}
                    hasData={logins !== undefined}
                    retrying={loginQuery.isFetching}
                    onRetry={() => void loginQuery.refetch()}
                  />
                )}
                {canReadOperation && operQuery.isError && (
                  <SourceFailure
                    source={t('operationSource')}
                    error={operQuery.error}
                    hasData={operations !== undefined}
                    retrying={operQuery.isFetching}
                    onRetry={() => void operQuery.refetch()}
                  />
                )}
              </div>
            ) : null}
            {loadingActivity && <SectionSkeleton />}
            {hasAuditAccess && !loadingActivity && !activityFailed && activity.length === 0 && (
              <div role="status" className="space-y-1 py-8 text-center">
                <p className="text-sm font-medium">{t('noActivity')}</p>
                <p className="text-xs text-muted-foreground">{t('noActivityHint')}</p>
              </div>
            )}
            <ul className="divide-y divide-border">
              {activity.map((item) => {
                const success =
                  item.kind === 'login' ? item.row.success === 1 : item.row.status === 1
                const Icon = item.kind === 'login' ? LogIn : ScrollText
                const title =
                  item.kind === 'login'
                    ? t(success ? 'loginSuccess' : 'loginFailure')
                    : item.row.title || t('operation')
                const actor =
                  item.kind === 'login' ? item.row.username : item.row.operName || t('unknownUser')
                const ip = item.kind === 'login' ? item.row.ip : item.row.operIp
                return (
                  <li key={item.id} className="flex items-start gap-3 py-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words text-sm font-medium">{title}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            success ? 'text-success-foreground' : 'text-destructive',
                          )}
                        >
                          {t(success ? 'succeeded' : 'failed')}
                        </Badge>
                      </div>
                      <p className="break-words text-xs text-muted-foreground">
                        {actor} · {ip || t('unknownIp')}
                      </p>
                      <time
                        dateTime={item.time}
                        className="block text-xs tabular-nums text-muted-foreground"
                      >
                        {item.time.replace('T', ' ').slice(0, 16)}
                      </time>
                    </div>
                  </li>
                )
              })}
            </ul>
            {hasAuditAccess && (
              <p className="border-t border-border py-3 text-xs leading-5 text-muted-foreground">
                {t('activityScope')}
              </p>
            )}
          </div>
        </section>

        <aside
          aria-labelledby="dashboard-sessions-title"
          className="space-y-4 rounded-panel border border-border bg-card p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 id="dashboard-sessions-title" className="text-base font-semibold">
                {t('online')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('onlineHint')}</p>
            </div>
            <MonitorDot className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          {!canReadOnline && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('noOnlineAccess')}
            </p>
          )}
          {canReadOnline && onlineQuery.isPending && <SectionSkeleton />}
          {canReadOnline && onlineQuery.isError && (
            <SourceFailure
              source={t('online')}
              error={onlineQuery.error}
              hasData={online !== undefined}
              retrying={onlineQuery.isFetching}
              onRetry={() => void onlineQuery.refetch()}
            />
          )}
          {online !== undefined && (
            <p
              data-slot="session-count"
              className="text-2xl font-semibold tracking-tight tabular-nums"
            >
              {online.length ? t('sessions', { count: online.length }) : t('noSessions')}
            </p>
          )}
          {onlineRoute && canReadOnline && (
            <Button variant="outline" asChild>
              <Link to={onlineRoute.path}>
                {t('manageSessions')}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </aside>
      </div>
    </div>
  )
}
