/**
 * 认证状态：令牌对、当前用户视图（用户/角色/权限/菜单）、登录/登出/刷新。
 *
 * 持久化：仅 tokens 落 localStorage（经 zustand persist，全项目唯一合法入口，
 * 业务代码禁止直接操作 localStorage）。用户视图每次启动经 ensureMe() 重取。
 *
 * 刷新机制：/auth/refresh 旋转换新已联调可用；历史持久化态无 refreshToken 时
 * tryRefresh 短路为 false → 40100 直接登出重登。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { queryClient } from '@/app/query-client'
import { ApiError, configureClient } from '@/lib/api/client'
import * as authApi from '@/lib/api/auth'
import { normalizeMenuNode, type MenuNode, type TokenPair, type UserInfo } from '@/lib/api/types'
import { accessLifecycle } from '@/lib/query/access-lease'

let loginSequence = 0
let meSequence = 0
let refreshFlight: { epoch: number; promise: Promise<boolean> } | undefined
let refreshingToken: string | undefined

interface AuthState {
  tokens: TokenPair | null
  user: UserInfo | null
  roles: string[]
  perms: string[]
  menus: MenuNode[]
  /** 当前用户视图是否已加载（路由守卫据此决定是否等待）。 */
  meLoaded: boolean
  /** 本地身份代次：阻止上一账户或上一令牌发起的在途请求覆盖当前身份。 */
  sessionEpoch: number

  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** 仅清理本地状态：供 401/刷新失败兜底，禁止作为产品主动注销动作。 */
  clearSession: () => void
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
      sessionEpoch: 0,

      async login(username, password) {
        const attempt = ++loginSequence
        const epoch = get().sessionEpoch
        let tokens: TokenPair
        try {
          tokens = await authApi.login(username, password)
        } catch (error) {
          if (attempt !== loginSequence || epoch !== get().sessionEpoch) return
          throw error
        }
        if (attempt !== loginSequence || epoch !== get().sessionEpoch) return
        // Query keys intentionally do not contain user identity. A successful account switch must
        // therefore remove every query and mutation before the new credentials become active.
        queryClient.clear()
        accessLifecycle.reset(epoch + 1, queryClient)
        set((state) => ({
          tokens,
          user: null,
          roles: [],
          perms: [],
          menus: [],
          meLoaded: false,
          sessionEpoch: state.sessionEpoch + 1,
        }))
        await get().ensureMe()
      },

      clearSession() {
        loginSequence++
        meSequence++
        accessLifecycle.reset(get().sessionEpoch + 1, queryClient)
        set((state) => ({
          tokens: null,
          user: null,
          roles: [],
          perms: [],
          menus: [],
          meLoaded: false,
          sessionEpoch: state.sessionEpoch + 1,
        }))
        queryClient.clear()
      },

      async logout() {
        const epoch = get().sessionEpoch
        if (!get().tokens) {
          get().clearSession()
          return
        }
        try {
          await authApi.logout()
        } catch (error) {
          if (epoch !== get().sessionEpoch) return
          throw error
        }
        if (epoch === get().sessionEpoch) get().clearSession()
      },

      async ensureMe() {
        const sessionEpoch = get().sessionEpoch
        const accessToken = get().tokens?.accessToken
        if (!accessToken || accessToken === refreshingToken) return
        const sequence = ++meSequence
        const current = () =>
          sequence === meSequence &&
          get().sessionEpoch === sessionEpoch &&
          get().tokens?.accessToken === accessToken
        try {
          const me = await authApi.fetchCurrentUser()
          if (!current()) return
          const menus = (me.menus ?? []).map(normalizeMenuNode)
          accessLifecycle.accept(sessionEpoch, menus, me.perms, queryClient)
          set({ user: me.user, roles: me.roles, perms: me.perms, menus, meLoaded: true })
        } catch (error) {
          if (!current()) return
          // /me does not recurse in the interceptor. One store-owned refresh may bootstrap it.
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
        const current = get().tokens
        if (!current?.refreshToken) return false
        const refreshToken = current.refreshToken
        const sessionEpoch = get().sessionEpoch
        if (refreshFlight?.epoch === sessionEpoch) return refreshFlight.promise
        refreshingToken = current.accessToken
        meSequence++
        accessLifecycle.pause(queryClient)
        set({ meLoaded: false })
        const run = async () => {
          try {
            const tokens = await authApi.refreshToken(refreshToken)
            if (
              get().sessionEpoch !== sessionEpoch ||
              get().tokens?.refreshToken !== current.refreshToken
            ) {
              return false
            }
            // Finish /me bootstrap before making the new authorization generation available.
            set({
              tokens,
              user: null,
              roles: [],
              perms: [],
              menus: [],
              meLoaded: false,
            })
            refreshingToken = undefined
            await get().ensureMe()
            return get().sessionEpoch === sessionEpoch && get().meLoaded
          } catch {
            if (get().sessionEpoch === sessionEpoch) get().clearSession()
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
      partialize: (state) => ({ tokens: state.tokens }),
    },
  ),
)

// client ↔ store 解耦接线（模块加载即完成一次）
configureClient({
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  getPrincipalEpoch: () => useAuthStore.getState().sessionEpoch,
  tryRefresh: () => useAuthStore.getState().tryRefresh(),
  onUnauthorized: () => {
    useAuthStore.getState().clearSession()
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login')
    }
  },
})
