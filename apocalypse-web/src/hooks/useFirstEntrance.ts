import { useEffect, useState } from 'react'

import { useAuthStore } from '@/stores/auth'
import { useSurfaceEntrance } from '@/stores/surface-entrance'

/**
 * True only for the first mount of `surface` within the current identity and authorization epoch.
 * The decision is fixed at mount; refreshes and re-renders never replay the entrance.
 */
export function useFirstEntrance(surface: string | undefined): boolean {
  const userId = useAuthStore((state) => state.user?.id ?? 'anonymous')
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const key = surface ? `${userId}:${epoch}:${surface}` : null
  const [first] = useState(() => (key ? !useSurfaceEntrance.getState().has(key) : true))
  useEffect(() => {
    if (key) useSurfaceEntrance.getState().mark(key)
  }, [key])
  return first
}
