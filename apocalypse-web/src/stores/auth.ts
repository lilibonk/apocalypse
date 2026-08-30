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

      async login(username, password) {
        const tokens = await authApi.login(username, password)
        set({ tokens, meLoaded: false })
        await get().ensureMe()
      },

      clearSession() {
        set({ tokens: null, user: null, roles: [], perms: [], menus: [], meLoaded: false })
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
        if (!get().tokens) return
        const me = await authApi.fetchCurrentUser()
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
        try {
          const tokens = await authApi.refreshToken(current.refreshToken)
          set({ tokens })
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
