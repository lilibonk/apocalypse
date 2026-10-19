import { create } from 'zustand'

/**
 * In-memory record of surfaces that already played their first-entrance motion in this tab.
 * Keys include identity and authorization epoch, so a new sign-in or authorization change replays
 * once while returning to a page in the same context lands directly on its final state.
 * Deliberately not persisted: it is UI state, never server data.
 */
interface SurfaceEntranceState {
  seen: ReadonlySet<string>
  mark: (key: string) => void
  has: (key: string) => boolean
}

export const useSurfaceEntrance = create<SurfaceEntranceState>((set, get) => ({
  seen: new Set<string>(),
  mark: (key) => {
    if (get().seen.has(key)) return
    set((state) => ({ seen: new Set(state.seen).add(key) }))
  },
  has: (key) => get().seen.has(key),
}))
