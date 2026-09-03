import type { QueryClient } from '@tanstack/react-query'

import type { MenuNode } from '@/lib/api/types'
import { normalizeTabKey } from '@/stores/tabs'

import { belongsToModuleQuery, hasMenuModule } from './menu-capabilities'

/** Called only after /me has loaded. Returns whether the current route needs a notified redirect. */
export function reconcileMenuAccess(
  menus: MenuNode[],
  allowedPaths: string[],
  pathname: string,
  queryClient: QueryClient,
  retainAllowed: (paths: string[]) => void,
): boolean {
  retainAllowed(allowedPaths)
  if (!hasMenuModule(menus, 'calendar')) {
    const filter = {
      predicate: (query: { queryKey: readonly unknown[] }) =>
        belongsToModuleQuery(query.queryKey, 'calendar'),
    }
    void queryClient.cancelQueries(filter)
    queryClient.removeQueries(filter)
  }
  const currentPath = normalizeTabKey(pathname)
  return currentPath !== '/' && !allowedPaths.includes(currentPath)
}
