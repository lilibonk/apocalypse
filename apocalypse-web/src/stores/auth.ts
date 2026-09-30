/** Browser access is memory-only; HttpOnly refresh rotates under an origin-wide Web Lock. */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { queryClient } from '@/app/query-client'
import { ApiError, configureClient } from '@/lib/api/client'
import * as authApi from '@/lib/api/auth'
import { normalizeMenuNode, type MenuNode, type TokenPair, type UserInfo } from '@/lib/api/types'
import {
  publishBrowserSessionChange,
  subscribeBrowserSessionChange,
  subscribeBrowserSessionRestore,
  supportsBrowserSessionLock,
  withBrowserSessionLock,
} from '@/lib/browser-session'
import { accessLifecycle } from '@/lib/query/access-lease'

let loginSequence = 0
let meSequence = 0
let refreshFlight: { epoch: number; promise: Promise<boolean> } | undefined
let bootstrapFlight: { epoch: number; promise: Promise<void> } | undefined
let refreshingToken: string | undefined
// Keep legacy cleanup inside Zustand's storage boundary, with no new persistence writes.
const legacyAuthStorage = createJSONStorage<Record<string, never>>(() => window.localStorage)

interface AuthState {
  tokens: TokenPair | null
  user: UserInfo | null
  roles: string[]
  perms: string[]
  menus: MenuNode[]
  meLoaded: boolean
  /** Cookie bootstrap must finish before a protected URL redirects to login. */
  bootstrapped: boolean
  /** Old account requests and callbacks cannot cross an identity boundary. */
  sessionEpoch: number
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  /** Local invalidation only; never mutates another tab's shared cookie. */
  clearSession: () => void
  bootstrap: () => Promise<void>
  ensureMe: () => Promise<void>
  hasPerm: (perm: string) => boolean
  tryRefresh: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      tokens: null,
      user: null,
      roles: [],
      perms: [],
      menus: [],
      meLoaded: false,
      bootstrapped: false,
      sessionEpoch: 0,

      async login(username, password) {
        const attempt = ++loginSequence
        const epoch = get().sessionEpoch
        const current = () => attempt === loginSequence && epoch === get().sessionEpoch
        return withBrowserSessionLock(async () => {
          if (!current()) return false
          let tokens: TokenPair
          try {
            tokens = await authApi.login(username, password)
          } catch (error) {
            if (!current()) return false
            throw error
          }
          if (!current()) return false
          queryClient.clear()
          await accessLifecycle.reset(epoch + 1, queryClient)
          if (!current()) return false
          set({
            tokens,
            user: null,
            roles: [],
            perms: [],
            menus: [],
            meLoaded: false,
            bootstrapped: false,
            sessionEpoch: epoch + 1,
          })
          await get().ensureMe()
          const accepted = await waitForCurrentUser(get().sessionEpoch, tokens.accessToken)
          if (!accepted) return false
          set({ bootstrapped: true })
          publishBrowserSessionChange()
          return true
        })
      },

      clearSession() {
        loginSequence++
        meSequence++
        // Invalidation and abort are synchronous; QueryClient cancellation handles rejection.
        void accessLifecycle.reset(get().sessionEpoch + 1, queryClient)
        set((state) => ({
          tokens: null,
          user: null,
          roles: [],
          perms: [],
          menus: [],
          meLoaded: false,
          bootstrapped: true,
          sessionEpoch: state.sessionEpoch + 1,
        }))
        queryClient.clear()
      },

      async logout() {
        const epoch = get().sessionEpoch
        const sequence = loginSequence
        if (!get().tokens) {
          get().clearSession()
          return
        }
        await withBrowserSessionLock(async () => {
          if (epoch !== get().sessionEpoch || sequence !== loginSequence) return
          try {
            await authApi.logout()
          } catch (error) {
            if (epoch !== get().sessionEpoch || sequence !== loginSequence) return
            // An invalid cookie cannot confirm server revocation, but its identity is unusable.
            // Clear only this tab; another tab may already own a freshly rotated shared cookie.
            if (error instanceof ApiError && error.code === 40100) get().clearSession()
            throw error
          }
          if (epoch === get().sessionEpoch && sequence === loginSequence) get().clearSession()
          // Receivers re-read the current cookie under the lock rather than trusting stale signals.
          publishBrowserSessionChange()
        })
      },

      async bootstrap() {
        if (get().bootstrapped) return
        const epoch = get().sessionEpoch
        if (bootstrapFlight?.epoch === epoch) return bootstrapFlight.promise
        const sequence = loginSequence
        const run = async () => {
          await get().tryRefresh()
          if (sequence === loginSequence) set({ bootstrapped: true })
        }
        const flight = { epoch, promise: run() }
        bootstrapFlight = flight
        try {
          await flight.promise
        } finally {
          if (bootstrapFlight === flight) bootstrapFlight = undefined
        }
      },

      async ensureMe() {
        const sessionEpoch = get().sessionEpoch
        const accessToken = get().tokens?.accessToken
        if (!accessToken || accessToken === refreshingToken) return
        const sequence = ++meSequence
        const priorUserId = get().user?.id
        const current = () =>
          sequence === meSequence &&
          get().sessionEpoch === sessionEpoch &&
          get().tokens?.accessToken === accessToken
        try {
          const me = await authApi.fetchCurrentUser()
          if (!current()) return
          const menus = (me.menus ?? []).map(normalizeMenuNode)
          const changedIdentity = priorUserId !== undefined && priorUserId !== me.user.id
          const nextEpoch = changedIdentity ? sessionEpoch + 1 : sessionEpoch
          if (changedIdentity) {
            // Shared cookie may have switched accounts in another tab. Clear ALL ownership first.
            queryClient.clear()
            await accessLifecycle.reset(nextEpoch, queryClient)
            if (!current()) return
          }
          await accessLifecycle.accept(nextEpoch, menus, me.perms, queryClient)
          if (!current()) return
          set({
            user: me.user,
            roles: me.roles,
            perms: me.perms,
            menus,
            meLoaded: true,
            sessionEpoch: nextEpoch,
          })
          if (changedIdentity) publishBrowserSessionChange()
        } catch (error) {
          if (!current()) return
          if (error instanceof ApiError && error.code === 40100 && !refreshFlight) {
            if (await get().tryRefresh()) return
            if (!current()) return
          }
          get().clearSession()
          throw error
        }
      },

      hasPerm(perm) {
        return get().perms.includes(perm)
      },

      async tryRefresh() {
        const sessionEpoch = get().sessionEpoch
        if (refreshFlight?.epoch === sessionEpoch) return refreshFlight.promise
        // Do not rotate or clear the shared cookie without cross-tab mutual exclusion.
        if (!supportsBrowserSessionLock()) {
          get().clearSession()
          return false
        }
        const originalToken = get().tokens?.accessToken
        const sequence = loginSequence
        const current = () =>
          get().sessionEpoch === sessionEpoch &&
          get().tokens?.accessToken === originalToken &&
          sequence === loginSequence
        refreshingToken = originalToken
        meSequence++
        // Must register single-flight before yielding; pause aborts stale leases synchronously.
        void accessLifecycle.pause(queryClient)
        queryClient.clear()
        set({ meLoaded: false })
        let rotatedAccess: string | undefined
        const run = async () => {
          try {
            return await withBrowserSessionLock(async () => {
              if (!current()) return false
              const tokens = await authApi.refreshToken()
              if (!current()) return false
              rotatedAccess = tokens.accessToken
              // Keep the previous user solely for identity comparison; no authorized UI is mounted.
              set({ tokens, roles: [], perms: [], menus: [], meLoaded: false })
              refreshingToken = undefined
              await get().ensureMe()
              const epoch = get().sessionEpoch
              await waitForCurrentUser(epoch, tokens.accessToken)
              return get().tokens?.accessToken === tokens.accessToken && get().meLoaded
            })
          } catch {
            if (
              sequence === loginSequence &&
              (get().sessionEpoch === sessionEpoch || get().tokens?.accessToken === rotatedAccess)
            )
              get().clearSession()
            return false
          }
        }
        const flight = { epoch: sessionEpoch, promise: run() }
        refreshFlight = flight
        try {
          return await flight.promise
        } finally {
          if (refreshFlight === flight) {
            refreshFlight = undefined
            refreshingToken = undefined
          }
        }
      },
    }),
    {
      name: 'apocalypse.auth',
      version: 1,
      storage: legacyAuthStorage
        ? { ...legacyAuthStorage, setItem: (name) => legacyAuthStorage.removeItem(name) }
        : undefined,
      // Upgrade discards old JSON refresh/access. Never send it to the new browser endpoints.
      migrate: () => ({}),
      merge: (_persisted, current) => current,
      partialize: () => ({}),
      onRehydrateStorage: () => () => {
        // Migration can finish asynchronously and write its empty version metadata afterward.
        queueMicrotask(() => useAuthStore.persist?.clearStorage())
      },
    },
  ),
)
// The legacy key is deleted through the only authorized storage boundary, Zustand persist.
useAuthStore.persist?.clearStorage()

function waitForCurrentUser(sessionEpoch: number, accessToken: string): Promise<boolean> {
  const outcome = () => {
    const state = useAuthStore.getState()
    if (state.sessionEpoch !== sessionEpoch || state.tokens?.accessToken !== accessToken)
      return false
    return state.meLoaded ? true : undefined
  }
  const current = outcome()
  if (current !== undefined) return Promise.resolve(current)
  return new Promise((resolve) => {
    const unsubscribe = useAuthStore.subscribe(() => {
      const result = outcome()
      if (result === undefined) return
      unsubscribe()
      resolve(result)
    })
  })
}

/** Start once at the application boundary, never from an isolated test fixture import. */
export function startBrowserSessionSync(): () => void {
  const stopChanges = subscribeBrowserSessionChange(() => {
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ bootstrapped: false })
    void useAuthStore.getState().bootstrap()
  })
  const stopRestoration = subscribeBrowserSessionRestore(() => {
    const state = useAuthStore.getState()
    // Reload has its own bootstrap; a pending refresh already owns revalidation.
    if (state.bootstrapped && state.tokens && state.meLoaded) void state.tryRefresh()
  })
  return () => {
    stopChanges()
    stopRestoration()
  }
}

configureClient({
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  getPrincipalEpoch: () => useAuthStore.getState().sessionEpoch,
  tryRefresh: () => useAuthStore.getState().tryRefresh(),
  onUnauthorized: () => {
    useAuthStore.getState().clearSession()
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login')
  },
})
