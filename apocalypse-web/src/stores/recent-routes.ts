import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { normalizeTabKey } from '@/stores/tabs'

/**
 * Recently visited menu routes for the command palette. Only route paths are stored, for a single
 * owner: another account replaces the list instead of seeing it. Rendering always intersects with
 * the routes currently authorized by /me, so revoked pages disappear immediately.
 */
export const RECENT_ROUTE_LIMIT = 6
/** Stable empty result: selectors must not return a fresh array for a non-owner. */
const NO_PATHS: readonly string[] = Object.freeze([])

interface RecentRoutesState {
  owner: string | null
  paths: string[]
  record: (owner: string, path: string) => void
  forOwner: (owner: string | null | undefined) => readonly string[]
}

export const useRecentRoutes = create<RecentRoutesState>()(
  persist(
    (set, get) => ({
      owner: null,
      paths: [],
      record(owner, path) {
        const key = normalizeTabKey(path)
        const current = get().owner === owner ? get().paths : []
        set({
          owner,
          paths: [key, ...current.filter((entry) => entry !== key)].slice(0, RECENT_ROUTE_LIMIT),
        })
      },
      forOwner(owner) {
        return owner && get().owner === owner ? get().paths : NO_PATHS
      },
    }),
    { name: 'apocalypse.recent-routes', version: 1 },
  ),
)
