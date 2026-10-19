import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'

import { useAuthStore } from '@/stores/auth'
import { useDraftStore, draftKey, totalDraftCount } from '@/stores/drafts'

/**
 * Keeps a page's unsaved draft in the in-memory draft store. `restored` is the draft found at mount
 * for the same route, scope, user and authorization epoch (otherwise undefined). Call `sync` whenever
 * the draft changes; a count of 0 removes it. While any draft exists, reload/close asks first.
 */
export function usePageDraft<T>(scope: string) {
  const route = useLocation().pathname
  const owner = useAuthStore((state) => state.user?.id ?? '')
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const [restored] = useState<T | undefined>(() => {
    const entry = useDraftStore.getState().entries[draftKey(route, scope)]
    return entry && entry.owner === owner && entry.epoch === epoch ? (entry.data as T) : undefined
  })
  const count = useDraftStore((state) => state.entries[draftKey(route, scope)]?.count ?? 0)
  useEffect(() => {
    if (count <= 0) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (totalDraftCount() > 0) event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [count])
  return {
    restored,
    sync: (data: T, dirtyCount: number) =>
      useDraftStore.getState().put(route, scope, dirtyCount, data),
    clear: () => useDraftStore.getState().remove(route, scope),
  }
}
