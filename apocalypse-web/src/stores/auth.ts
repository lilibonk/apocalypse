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
import { configureClient } from '@/lib/api/client'
import * as authApi from '@/lib/api/auth'
import { normalizeMenuNode, type MenuNode, type TokenPair, type UserInfo } from '@/lib/api/types'

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
        const tokens = await authApi.login(username, password)
        // Query keys intentionally do not contain user identity. A successful account switch must
        // therefore remove every query and mutation before the new credentials become active.
        queryClient.clear()
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
        if (!get().tokens) {
          get().clearSession()
          return
        }
        await authApi.logout()
        get().clearSession()
      },

      async ensureMe() {
        const sessionEpoch = get().sessionEpoch
        const accessToken = get().tokens?.accessToken
        if (!accessToken) return
        const me = await authApi.fetchCurrentUser()
        if (get().sessionEpoch !== sessionEpoch || get().tokens?.accessToken !== accessToken) {
          return
        }
        set({
          user: me.user,
          roles: me.roles,
          perms: me.perms,
          menus: (me.menus ?? []).map(normalizeMenuNode),
          meLoaded: true,
        })
      },

      hasPerm(perm) {
        return get().perms.includes(perm)
      },

      async tryRefresh() {
        const current = get().tokens
        if (!current?.refreshToken) return false
        const sessionEpoch = get().sessionEpoch
        try {
          const tokens = await authApi.refreshToken(current.refreshToken)
          if (
            get().sessionEpoch !== sessionEpoch ||
            get().tokens?.refreshToken !== current.refreshToken
          ) {
            return false
          }
          // A refreshed identity must re-read /me before any previously visible capability is
          // trusted. RequireAuth performs that refresh while the existing request is replayed.
          set((state) => ({
            tokens,
            user: null,
            roles: [],
            perms: [],
            menus: [],
            meLoaded: false,
            sessionEpoch: state.sessionEpoch + 1,
          }))
          return true
        } catch {
          return false
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
  tryRefresh: () => useAuthStore.getState().tryRefresh(),
  onUnauthorized: () => {
    useAuthStore.getState().clearSession()
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login')
    }
  },
})
