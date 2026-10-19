import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CanceledError } from 'axios'

import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'
import {
  getLoginInsights,
  getOperInsights,
  type LogInsightRange,
} from '@/views/system/log/log-insight.api'
import { pageLoginLogs } from '@/views/system/log/login/login-log.api'
import { pageOperLogs } from '@/views/system/log/oper/oper-log.api'
import { listOnlineUsers } from '@/views/system/online/online.api'

import { DASHBOARD_ACTIVITY_LIMIT } from './dashboard-insights.model'

const noSelection = () => {}

/** Core System uses its existing auth lifecycle, without pretending to be an optional module. */
function useDashboardSource<T>(
  source: string,
  permission: string,
  fetchSource: (signal: AbortSignal) => Promise<T>,
  variant: string | number,
) {
  const client = useQueryClient()
  const epoch = useAuthStore((state) => state.sessionEpoch)
  const userId = useAuthStore((state) => state.user?.id)
  const allowed = useAuthStore((state) => state.meLoaded && state.perms.includes(permission))
  const queryKey = useMemo(
    () => ['dashboard', source, epoch, userId, permission, allowed, variant] as const,
    [source, epoch, userId, permission, allowed, variant],
  )
  const lifecycle = useRef<{ active: boolean; key: typeof queryKey | null }>({
    active: false,
    key: null,
  })
  const query = useQuery({
    queryKey,
    enabled: allowed,
    queryFn: async ({ signal }) => {
      const assertCurrent = () => {
        const auth = useAuthStore.getState()
        if (
          signal.aborted ||
          auth.sessionEpoch !== epoch ||
          auth.user?.id !== userId ||
          !auth.meLoaded ||
          !auth.perms.includes(permission)
        ) {
          throw new CanceledError('Dashboard authorization changed')
        }
      }
      assertCurrent()
      const result = await fetchSource(signal)
      assertCurrent()
      return result
    },
  })
  useEffect(() => {
    lifecycle.current = { active: true, key: queryKey }
    return () => {
      lifecycle.current.active = false
      queueMicrotask(() => {
        // StrictMode immediately replays this effect with the same key. Real unmounts and
        // permission/identity changes still clear the exact departing source/context.
        if (lifecycle.current.active && lifecycle.current.key === queryKey) return
        const filter = { queryKey, exact: true }
        void client.cancelQueries(filter, { revert: false })
        client.removeQueries(filter)
      })
    }
  }, [client, queryKey])
  useResourceDenial({ errors: [query.error], clear: { queryKey, exact: true }, reset: noSelection })
  return { ...query, allowed }
}

const fetchOnline = (signal: AbortSignal) => listOnlineUsers({ signal })

export function useDashboardSources(limit: 4 | typeof DASHBOARD_ACTIVITY_LIMIT) {
  const login = useDashboardSource(
    'login-logs',
    'system:log:login',
    (signal) => pageLoginLogs(1, limit, undefined, signal),
    limit,
  )
  const operation = useDashboardSource(
    'oper-logs',
    'system:log:oper',
    (signal) => pageOperLogs(1, limit, undefined, signal),
    limit,
  )
  const online = useDashboardSource('online-users', 'system:online:list', fetchOnline, limit)
  return { login, operation, online }
}

/** Server-side full aggregation for the selected range; one request per readable source. */
export function useDashboardInsights(range: LogInsightRange) {
  const login = useDashboardSource(
    'login-insights',
    'system:log:login',
    (signal) => getLoginInsights(range, signal),
    range,
  )
  const operation = useDashboardSource(
    'oper-insights',
    'system:log:oper',
    (signal) => getOperInsights(range, signal),
    range,
  )
  return { login, operation }
}

/**
 * While a new range loads, keep showing the previous range's value so numbers roll from it instead
 * of flashing a skeleton. Carried only within the same identity/permission context; any context
 * change or source error drops it.
 */
export function useCarriedValue<T>(value: T | undefined, pending: boolean, context: string) {
  const [carried, setCarried] = useState<{ context: string; value: T } | null>(null)
  if (value !== undefined && (carried?.value !== value || carried.context !== context))
    setCarried({ context, value })
  if (carried && carried.context !== context) setCarried(null)
  if (value !== undefined) return value
  return pending && carried?.context === context ? carried.value : undefined
}
