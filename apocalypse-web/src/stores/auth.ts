/** Browser access is memory-only; HttpOnly refresh rotates under an origin-wide Web Lock. */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { CanceledError } from 'axios'

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
import {
  authorizationDeadline,
  ExpiredAuthorizationSnapshot,
} from '@/lib/query/authorization-snapshot'

let loginSequence = 0
let meSequence = 0
let refreshFlight: { epoch: number; promise: Promise<boolean> } | undefined
let bootstrapFlight: { epoch: number; promise: Promise<void> } | undefined
let refreshingToken: string | undefined
let meFlight:
  { epoch: number; authorizationEpoch: number; token: string; promise: Promise<void> } | undefined
let authorizationTimer: ReturnType<typeof setTimeout> | undefined
let expirationRevalidationQueued = false
// Keep legacy cleanup inside Zustand's storage boundary, with no new persistence writes.
const legacyAuthStorage = createJSONStorage<Record<string, never>>(() => window.localStorage)

interface AuthState {
  tokens: TokenPair | null
  user: UserInfo | null
  roles: string[]
  perms: string[]
  allScopePerms: string[]
  menus: MenuNode[]
  authorizationEpoch: number
  authorizationSnapshotId: string | null
  authorizationDeadline: number
  authorizationError: string | null
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
      allScopePerms: [],
      menus: [],
      authorizationEpoch: 0,
      authorizationSnapshotId: null,
      authorizationDeadline: Number.POSITIVE_INFINITY,
      authorizationError: null,
      meLoaded: false,
      bootstrapped: false,
      sessionEpoch: 0,

      async login(username, password) {
        const attempt = ++loginSequence
        const epoch = get().sessionEpoch
        const current = () => attempt === loginSequence && epoch === get().sessionEpoch
        const installed = await withBrowserSessionLock(async () => {
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
            allScopePerms: [],
            menus: [],
            authorizationEpoch: get().authorizationEpoch + 1,
            authorizationSnapshotId: null,
            authorizationDeadline: Number.POSITIVE_INFINITY,
            authorizationError: null,
            meLoaded: false,
            bootstrapped: false,
            sessionEpoch: epoch + 1,
          })
          return { sessionEpoch: epoch + 1 }
        })
        if (!installed) return false
        // /me may need refresh after a concurrent authorization change. Web Locks are not
        // reentrant, so leave the cookie mutation lock before that refresh can acquire it.
        await get().ensureMe()
        const installedIsCurrent = () =>
          attempt === loginSequence && installed.sessionEpoch === get().sessionEpoch
        const accessToken = get().tokens?.accessToken
        if (!installedIsCurrent() || !accessToken) return false
        const accepted = await waitForCurrentUser(installed.sessionEpoch, accessToken)
        if (!accepted || !installedIsCurrent()) return false
        set({ bootstrapped: true })
        publishBrowserSessionChange()
        return true
      },

      clearSession() {
        loginSequence++
        meSequence++
        clearTimeout(authorizationTimer)
        // Invalidation and abort are synchronous; QueryClient cancellation handles rejection.
        void accessLifecycle.reset(get().sessionEpoch + 1, queryClient)
        set((state) => ({
          tokens: null,
          user: null,
          roles: [],
          perms: [],
          allScopePerms: [],
          menus: [],
          authorizationEpoch: state.authorizationEpoch + 1,
          authorizationSnapshotId: null,
          authorizationDeadline: Number.POSITIVE_INFINITY,
          authorizationError: null,
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
        let sessionEpoch = get().sessionEpoch
        let authorizationEpoch = get().authorizationEpoch
        const accessToken = get().tokens?.accessToken
        if (!accessToken || accessToken === refreshingToken) return
        if (
          meFlight?.epoch === sessionEpoch &&
          meFlight.authorizationEpoch === authorizationEpoch &&
          meFlight.token === accessToken
        )
          return meFlight.promise
        const sequence = ++meSequence
        const priorUserId = get().user?.id
        const current = () =>
          sequence === meSequence &&
          get().sessionEpoch === sessionEpoch &&
          get().authorizationEpoch === authorizationEpoch &&
          get().tokens?.accessToken === accessToken
        const run = async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const started = performance.now()
              const me = await authApi.fetchCurrentUser()
              if (!current()) return
              const deadline = authorizationDeadline(me, started, performance.now())
              if (!Array.isArray(me.allScopePerms))
                throw new Error('授权范围快照格式无效，请重新加载')
              const menus = (me.menus ?? []).map(normalizeMenuNode)
              const changedIdentity = priorUserId !== undefined && priorUserId !== me.user.id
              const changedAuthorization =
                get().authorizationSnapshotId !== me.authorizationSnapshotId
              if (changedIdentity || (changedAuthorization && get().meLoaded)) {
                invalidateAuthorization()
                authorizationEpoch = get().authorizationEpoch
                if (changedIdentity) {
                  sessionEpoch++
                  set({ sessionEpoch })
                  await accessLifecycle.reset(sessionEpoch, queryClient)
                  if (!current()) return
                }
              }
              await accessLifecycle.accept(sessionEpoch, menus, me.perms, queryClient, {
                epoch: get().authorizationEpoch,
                deadline,
              })
              if (!current()) return
              if (performance.now() >= deadline) throw new ExpiredAuthorizationSnapshot()
              set({
                user: me.user,
                roles: me.roles,
                perms: me.perms,
                allScopePerms: me.allScopePerms,
                menus,
                meLoaded: true,
                authorizationSnapshotId: me.authorizationSnapshotId,
                authorizationDeadline: deadline,
                authorizationError: null,
              })
              scheduleAuthorizationExpiry()
              if (changedIdentity) publishBrowserSessionChange()
              return
            } catch (error) {
              if (!current()) return
              if (error instanceof ExpiredAuthorizationSnapshot) {
                invalidateAuthorization()
                authorizationEpoch = get().authorizationEpoch
                if (attempt < 2) continue
                set({ authorizationError: '授权状态正在变化，请重新校验后继续' })
                return
              }
              if (error instanceof ApiError && error.code === 40100) {
                if (!refreshFlight && (await get().tryRefresh())) return
                if (!current()) return
                get().clearSession()
                throw error
              }
              // A valid background focus recheck retains its UI and drafts on network failure.
              if (!isAuthorizationCurrent()) {
                invalidateAuthorization()
                set({
                  authorizationError:
                    error instanceof Error ? error.message : '无法校验授权，请重试',
                })
              }
              throw error
            }
          }
        }
        const flight = {
          epoch: sessionEpoch,
          authorizationEpoch,
          token: accessToken,
          promise: run(),
        }
        meFlight = flight
        try {
          await flight.promise
        } finally {
          if (meFlight === flight) meFlight = undefined
        }
      },

      hasPerm(perm) {
        return isAuthorizationCurrent() && get().perms.includes(perm)
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
        invalidateAuthorization()
        let rotatedAccess: string | undefined
        const run = async () => {
          try {
            return await withBrowserSessionLock(async () => {
              if (!current()) return false
              const tokens = await authApi.refreshToken()
              if (!current()) return false
              rotatedAccess = tokens.accessToken
              // Keep the previous user solely for identity comparison; no authorized UI is mounted.
              set({ tokens, roles: [], perms: [], allScopePerms: [], menus: [], meLoaded: false })
              refreshingToken = undefined
              await get().ensureMe()
              const epoch = get().sessionEpoch
              await waitForCurrentUser(epoch, tokens.accessToken)
              return get().tokens?.accessToken === tokens.accessToken && get().meLoaded
            })
          } catch {
            if (
              rotatedAccess &&
              get().tokens?.accessToken === rotatedAccess &&
              get().authorizationError
            )
              return false
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
    if (state.authorizationError && !state.meLoaded) return false
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
  const stopRestoration = subscribeBrowserSessionRestore((restoredFromCache) => {
    const state = useAuthStore.getState()
    // Valid focus revalidation does not rotate the cookie or discard unchanged drafts.
    if (state.bootstrapped && state.tokens) {
      if (restoredFromCache) {
        // A suspended document may have missed another tab's login/logout. Its old Bearer
        // can remain valid, so /me alone cannot bind it to the current shared cookie.
        void state.tryRefresh()
        return
      }
      if (!isAuthorizationCurrent()) invalidateAuthorization()
      void state.ensureMe().catch(() => {})
    }
  })
  return () => {
    stopChanges()
    stopRestoration()
  }
}

/** Passive check is safe during rendering; dispatch/commit uses the asserting variant. */
export function isAuthorizationCurrent(epoch?: number): boolean {
  const state = useAuthStore.getState()
  return (
    state.meLoaded &&
    (epoch === undefined || epoch === state.authorizationEpoch) &&
    performance.now() < state.authorizationDeadline
  )
}

export function assertAuthorizationCurrent(epoch?: number): void {
  if (isAuthorizationCurrent(epoch)) return
  const state = useAuthStore.getState()
  if (state.meLoaded && performance.now() >= state.authorizationDeadline) {
    invalidateAuthorization()
    if (!expirationRevalidationQueued) {
      expirationRevalidationQueued = true
      queueMicrotask(() => {
        expirationRevalidationQueued = false
        void useAuthStore
          .getState()
          .ensureMe()
          .catch(() => {})
      })
    }
  }
  throw new CanceledError('Authorization snapshot changed or expired')
}

function invalidateAuthorization(): void {
  clearTimeout(authorizationTimer)
  void accessLifecycle.pause(queryClient)
  useAuthStore.setState((state) => ({
    authorizationEpoch: state.authorizationEpoch + 1,
    meLoaded: false,
    perms: [],
    allScopePerms: [],
    authorizationError: null,
  }))
  queryClient.clear()
}

function scheduleAuthorizationExpiry(): void {
  clearTimeout(authorizationTimer)
  const state = useAuthStore.getState()
  if (!Number.isFinite(state.authorizationDeadline)) return
  const epoch = state.authorizationEpoch
  authorizationTimer = setTimeout(
    () => {
      if (useAuthStore.getState().authorizationEpoch !== epoch) return
      if (isAuthorizationCurrent(epoch)) {
        scheduleAuthorizationExpiry()
        return
      }
      try {
        assertAuthorizationCurrent(epoch)
      } catch {
        // Expiry invalidated synchronously and queued one shared revalidation.
      }
    },
    Math.max(0, Math.min(state.authorizationDeadline - performance.now(), 2_147_483_647)),
  )
}

accessLifecycle.configureAuthorizationGuard(assertAuthorizationCurrent)

configureClient({
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  getPrincipalEpoch: () => useAuthStore.getState().sessionEpoch,
  getAuthorizationEpoch: () => useAuthStore.getState().authorizationEpoch,
  subscribeAuthorization: (listener) => useAuthStore.subscribe(listener),
  assertAuthorizationCurrent,
  assertPermissionAccess: (permissions, allScopes) => {
    assertAuthorizationCurrent()
    const state = useAuthStore.getState()
    if (
      !permissions.every((permission) => state.perms.includes(permission)) ||
      !allScopes.every((permission) => state.allScopePerms.includes(permission))
    )
      throw new CanceledError('Operation permission changed')
  },
  tryRefresh: () => useAuthStore.getState().tryRefresh(),
  onUnauthorized: () => {
    // Refresh may have authenticated successfully while its /me snapshot needs a retry.
    const state = useAuthStore.getState()
    if (state.tokens && state.authorizationError) return
    useAuthStore.getState().clearSession()
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login')
  },
})
