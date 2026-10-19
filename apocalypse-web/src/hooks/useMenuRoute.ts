import { useMemo } from 'react'

import { flattenMenuRoutes } from '@/routes/menu-routes'
import { useAuthStore } from '@/stores/auth'

/**
 * Path of the authorized menu page whose component is `component` (e.g. 'system/online'), or
 * undefined when the current `/me` menus do not include it. Links built from it never point to a
 * page the viewer cannot open.
 */
export function useMenuRoute(component: string): string | undefined {
  const menus = useAuthStore((state) => state.menus)
  return useMemo(
    () =>
      flattenMenuRoutes(menus).find(
        (route) => route.component?.replace(/^\/+|\/+$/g, '').replace(/\/index$/, '') === component,
      )?.path,
    [menus, component],
  )
}
