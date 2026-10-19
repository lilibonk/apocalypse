/**
 * User list insight strip. Read-only figures from existing endpoints, each shown only when the
 * viewer may read its source: accounts in the user data scope, users without roles (authorization
 * overview, same scope), online sessions and 24-hour sign-in attempts (system-wide, linked to
 * their own pages). Queries nest under the DynaPage key so refresh, writes and denial reach them.
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { InsightStrip, type InsightStripStat } from '@/components/insights/InsightStrip'
import { useMenuRoute } from '@/hooks/useMenuRoute'
import { ApiError, request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import { useAuthStore } from '@/stores/auth'
import { getLoginInsights } from '@/views/system/log/log-insight.api'
import { listOnlineUsers } from '@/views/system/online/online.api'
import { getAuthorizationOverview } from '@/views/system/role/authorization-insight.api'
import { canAskAuthorizationQuestions } from '@/views/system/role/authorization-questions.model'

export function UserInsights({ queryKey }: { queryKey: readonly unknown[] | undefined }) {
  const { t } = useTranslation('system')
  const perms = useAuthStore((state) => state.perms)
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const base = [...(queryKey ?? ['system', 'users', 'summary']), epoch]
  const canOverview = useAuthStore(canAskAuthorizationQuestions)
  const canOnline = perms.includes('system:online:list')
  const canLogins = perms.includes('system:log:login')
  const onlineRoute = useMenuRoute('system/online')
  const loginRoute = useMenuRoute('system/log/login')

  const accounts = useQuery({
    queryKey: [...base, 'accounts'],
    queryFn: ({ signal }) =>
      request<PageResult<unknown>>('/system/users/page', { query: { page: 1, size: 1 }, signal }),
  })
  const overview = useQuery({
    queryKey: [...base, 'overview'],
    queryFn: ({ signal }) => getAuthorizationOverview(signal),
    enabled: canOverview,
  })
  const online = useQuery({
    queryKey: [...base, 'online'],
    queryFn: ({ signal }) => listOnlineUsers({ signal }),
    enabled: canOnline,
  })
  const logins = useQuery({
    queryKey: [...base, 'logins'],
    queryFn: ({ signal }) => getLoginInsights('DAY', signal),
    enabled: canLogins,
  })

  // A failed source drops only its own figure (the alert explains it); the rest stay visible.
  const stats: (InsightStripStat & { failed: boolean })[] = [
    {
      failed: accounts.isError,
      key: 'accounts',
      label: t('listInsights.users.accounts'),
      hint: t('listInsights.users.accountsHint'),
      value: accounts.data?.total ?? null,
    },
  ]
  if (canOverview && overview.data?.usersVisible !== false)
    stats.push({
      failed: overview.isError,
      key: 'withoutRoles',
      label: t('listInsights.users.withoutRoles'),
      hint: t('listInsights.users.withoutRolesHint'),
      value: overview.data?.usersWithoutRolesCount ?? null,
    })
  if (canOnline)
    stats.push({
      failed: online.isError,
      key: 'online',
      label: t('listInsights.users.online'),
      hint: t('listInsights.users.onlineHint'),
      value: online.data?.length ?? null,
      href: onlineRoute,
      linkLabel: t('listInsights.users.onlineLink'),
    })
  if (canLogins)
    stats.push({
      failed: logins.isError,
      key: 'logins',
      label: t('listInsights.users.logins'),
      hint: t('listInsights.users.loginsHint'),
      value: logins.data?.total ?? null,
      href: loginRoute,
      linkLabel: t('listInsights.users.loginsLink'),
    })

  const failed = [accounts, overview, online, logins].filter((query) => query.isError)
  const error = failed[0]?.error
  return (
    <InsightStrip
      id="user-insights"
      title={t('listInsights.users.title')}
      hint={t('listInsights.users.hint')}
      stats={stats.filter((stat) => !stat.failed)}
      error={error ? (error instanceof ApiError ? error.message : t('listInsights.failed')) : null}
      retryText={t('listInsights.retry')}
      onRetry={() => failed.forEach((query) => void query.refetch())}
      entranceKey="system:user:insights"
    />
  )
}
