/**
 * 认证端点 + 登录响应适配层。
 *
 * 后端 AuthService.TokenResponse 为 {accessToken, refreshToken, tokenType, expiresIn}，
 * /auth/refresh 为旋转换新（旧 refresh 一次性作废）。normalizeTokenPair 宽松收字段，
 * 后端契约微调时只需改本文件，上层零改动。
 */

import { request } from './client'
import type { CurrentUser, TokenPair } from './types'

/** 后端原始登录响应（字段以实际为准，宽松收）。 */
interface RawTokenResponse {
  accessToken: string
  refreshToken?: string | null
  expiresIn: number
  tokenType?: string
}

function normalizeTokenPair(raw: RawTokenResponse): TokenPair {
  return {
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken ?? null,
    expiresIn: raw.expiresIn,
    tokenType: raw.tokenType ?? 'Bearer',
  }
}

export function login(username: string, password: string): Promise<TokenPair> {
  return request<RawTokenResponse>('/auth/login', {
    method: 'POST',
    body: { username, password },
    anonymous: true,
  }).then(normalizeTokenPair)
}

/**
 * 刷新令牌（旋转机制：旧 refresh 一次性失效）。
 * 对历史持久化态（无 refreshToken）store 侧会短路，本函数不会被调用。
 */
export function refreshToken(refreshTokenValue: string): Promise<TokenPair> {
  return request<RawTokenResponse>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: refreshTokenValue },
    anonymous: true,
  }).then(normalizeTokenPair)
}

/** 主动注销：服务端持久化撤销当前用户全部会话。 */
export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' })
}

/** 当前登录用户视图（用户/角色/权限/菜单树）。 */
export function fetchCurrentUser(): Promise<CurrentUser> {
  return request<CurrentUser>('/system/users/me')
}
