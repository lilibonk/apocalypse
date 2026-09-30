/**
 * 认证端点 + 登录响应适配层。
 *
 * Browser endpoints keep refresh in an HttpOnly cookie. Access is returned to memory only.
 * The machine-client JSON token-pair contract remains on the backend's legacy endpoints.
 */

import { request } from './client'
import type { CurrentUser, TokenPair } from './types'

/** 后端原始登录响应（字段以实际为准，宽松收）。 */
interface RawTokenResponse {
  accessToken: string
  expiresIn: number
  tokenType?: string
}

function normalizeTokenPair(raw: RawTokenResponse): TokenPair {
  return {
    accessToken: raw.accessToken,
    refreshToken: null,
    expiresIn: raw.expiresIn,
    tokenType: raw.tokenType ?? 'Bearer',
  }
}

export async function fetchCsrf(): Promise<void> {
  await request<{ token: string }>('/auth/browser/csrf', { anonymous: true })
}

export async function login(username: string, password: string): Promise<TokenPair> {
  await fetchCsrf()
  const raw = await request<RawTokenResponse>('/auth/browser/login', {
    method: 'POST',
    body: { username, password },
    anonymous: true,
  })
  return normalizeTokenPair(raw)
}

/**
 * 刷新令牌（旋转机制：旧 refresh 一次性失效）。
 * The browser re-reads its shared cookie at send time while holding the origin-wide lock.
 */
export async function refreshToken(): Promise<TokenPair> {
  await fetchCsrf()
  const raw = await request<RawTokenResponse>('/auth/browser/refresh', {
    method: 'POST',
    anonymous: true,
  })
  return normalizeTokenPair(raw)
}

/** 主动注销：服务端持久化撤销当前用户全部会话。 */
export async function logout(): Promise<void> {
  await fetchCsrf()
  await request<void>('/auth/browser/logout', { method: 'POST', anonymous: true })
}

/** 当前登录用户视图（用户/角色/权限/菜单树）。 */
export function fetchCurrentUser(): Promise<CurrentUser> {
  return request<CurrentUser>('/system/users/me', { noRefresh: true })
}
