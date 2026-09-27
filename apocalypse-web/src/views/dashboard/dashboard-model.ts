import { isResourceDenied } from '@/lib/query/use-resource-denial'
import type { FlatRoute } from '@/routes/menu-routes'
import type { LoginLogRow } from '@/views/system/log/login/login-log.api'
import type { OperLogRow } from '@/views/system/log/oper/oper-log.api'

/** Task identity follows the installed component, independent of editable menu labels and URLs. */
export function routeComponent(route: FlatRoute): string {
  return route.component?.replace(/^\/+|\/+$/g, '').replace(/\/index$/, '') ?? ''
}

const primaryTasks = [
  'system/user',
  'system/role',
  'system/dept',
  'system/dict',
  'system/config',
  'system/menu',
]

export function commonTaskRoutes(routes: FlatRoute[]): FlatRoute[] {
  const tasks = routes.filter((route) => routeComponent(route) !== 'dashboard')
  const preferred = primaryTasks.flatMap((component) =>
    tasks.filter((route) => routeComponent(route) === component),
  )
  return [...preferred, ...tasks.filter((route) => !preferred.includes(route))].slice(0, 6)
}

/** Disabled queries retain their cache. Permission and resource denial must win over that cache. */
export function readableQueryData<T>(
  allowed: boolean,
  query: { data: T | undefined; error: unknown },
): T | undefined {
  return allowed && !isResourceDenied(query.error) ? query.data : undefined
}

export type RecentActivity =
  | { kind: 'login'; id: string; time: string; row: LoginLogRow }
  | { kind: 'operation'; id: string; time: string; row: OperLogRow }

export function recentActivity(
  logins: LoginLogRow[] = [],
  operations: OperLogRow[] = [],
): RecentActivity[] {
  const items: RecentActivity[] = [
    ...logins.map((row) => ({
      kind: 'login' as const,
      id: `login-${row.id}`,
      time: row.loginTime,
      row,
    })),
    ...operations.map((row) => ({
      kind: 'operation' as const,
      id: `operation-${row.id}`,
      time: row.operTime,
      row,
    })),
  ]
  return items.sort((left, right) => right.time.localeCompare(left.time)).slice(0, 6)
}
