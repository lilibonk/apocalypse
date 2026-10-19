import { create } from 'zustand'

import { normalizeTabKey } from '@/stores/tabs'
import { useAuthStore } from '@/stores/auth'

/**
 * Unsaved page drafts kept in memory so leaving a route and coming back restores them. Each entry is
 * stamped with the user and authorization epoch; any identity or authorization change drops it
 * (same-snapshot revalidation keeps the epoch and therefore the draft). Never persisted.
 */
export interface DraftEntry {
  route: string
  scope: string
  owner: string
  epoch: number
  count: number
  data: unknown
}

interface DraftState {
  entries: Readonly<Record<string, DraftEntry>>
  put: (route: string, scope: string, count: number, data: unknown) => void
  remove: (route: string, scope: string) => void
  clearRoutes: (routes: readonly string[]) => void
  countFor: (route: string) => number
}

export function draftKey(route: string, scope: string) {
  return `${normalizeTabKey(route)}::${scope}`
}

function stamp() {
  const auth = useAuthStore.getState()
  return { owner: auth.user?.id ?? '', epoch: auth.authorizationEpoch }
}

export const useDraftStore = create<DraftState>((set, get) => ({
  entries: {},
  put(route, scope, count, data) {
    const key = draftKey(route, scope)
    if (count <= 0) {
      get().remove(route, scope)
      return
    }
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { route: normalizeTabKey(route), scope, count, data, ...stamp() },
      },
    }))
  },
  remove(route, scope) {
    const key = draftKey(route, scope)
    if (!(key in get().entries)) return
    set((state) => {
      const next = { ...state.entries }
      delete next[key]
      return { entries: next }
    })
  },
  clearRoutes(routes) {
    const targets = new Set(routes.map(normalizeTabKey))
    set((state) => ({
      entries: Object.fromEntries(
        Object.entries(state.entries).filter(([, entry]) => !targets.has(entry.route)),
      ),
    }))
  },
  countFor(route) {
    const target = normalizeTabKey(route)
    return Object.values(get().entries)
      .filter((entry) => entry.route === target)
      .reduce((sum, entry) => sum + entry.count, 0)
  },
}))

/** Drop drafts that no longer belong to the current identity or authorization epoch. */
function prune() {
  const { owner, epoch } = stamp()
  const entries = useDraftStore.getState().entries
  const kept = Object.entries(entries).filter(
    ([, entry]) => entry.owner === owner && entry.epoch === epoch,
  )
  if (kept.length !== Object.keys(entries).length)
    useDraftStore.setState({ entries: Object.fromEntries(kept) })
}

useAuthStore.subscribe((state, previous) => {
  if (
    state.user?.id !== previous.user?.id ||
    state.authorizationEpoch !== previous.authorizationEpoch ||
    state.sessionEpoch !== previous.sessionEpoch
  )
    prune()
})

export function totalDraftCount() {
  return Object.values(useDraftStore.getState().entries).reduce(
    (sum, entry) => sum + entry.count,
    0,
  )
}
