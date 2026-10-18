import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CanceledError } from 'axios'

import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'
import { pageLoginLogs } from '@/views/system/log/login/login-log.api'
import { pageOperLogs } from '@/views/system/log/oper/oper-log.api'
import { listOnlineUsers } from '@/views/system/online/online.api'

import { DASHBOARD_SAMPLE_LIMIT } from './dashboard-insights.model'

const noSelection = () => {}

/** Core System uses its existing auth lifecycle, without pretending to be an optional module. */
function useDashboardSource<T>(
  source: string,
  permission: string,
  fetchSource: (signal: AbortSignal) => Promise<T>,
  limit: 4 | typeof DASHBOARD_SAMPLE_LIMIT,
) {
  const client = useQueryClient()
  const epoch = useAuthStore((state) => state.sessionEpoch)
  const userId = useAuthStore((state) => state.user?.id)
  const allowed = useAuthStore((state) => state.meLoaded && state.perms.includes(permission))
  const queryKey = useMemo(
    () => ['dashboard', source, epoch, userId, permission, allowed, limit] as const,
    [source, epoch, userId, permission, allowed, limit],
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

export function useDashboardSources(
  limit: 4 | typeof DASHBOARD_SAMPLE_LIMIT = DASHBOARD_SAMPLE_LIMIT,
) {
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
