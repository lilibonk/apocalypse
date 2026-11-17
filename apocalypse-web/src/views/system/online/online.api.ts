/**
 * 在线用户端点（页面局部）。
 * - GET /system/online-users → List（非分页）
 * - DELETE /system/online-users/{jti} → 仅吊销单台设备的指定会话（Single-Session Kick）
 * - DELETE /system/online-users/user/{username} → 递增凭证版本并强退该账号全部设备（All-Device Account Kick）
 */

import { request, type RequestOptions } from '@/lib/api/client'

/** 在线用户会话（对应后端 OnlineUserResp）。 */
export type OnlineUserRow = {
  jti: string
  username: string
  loginTime: string
  ip: string | null
  userAgent: string | null
}

export type KickTarget =
  | {
      mode: 'account'
      username: string
      sessionCount: number
      sampleSession: OnlineUserRow
    }
  | {
      mode: 'session'
      session: OnlineUserRow
      accountSessionCount: number
    }

/** 在线用户列表（List 非分页）。 */
export function listOnlineUsers(options?: { signal?: AbortSignal }): Promise<OnlineUserRow[]> {
  return request<OnlineUserRow[]>('/system/online-users', { signal: options?.signal })
}

/** 仅吊销指定 jti 的单台设备会话，不影响同账号其他在线设备。 */
export function kickOnlineSession(
  jti: string,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/system/online-users/${encodeURIComponent(jti)}`, {
    method: 'DELETE',
    ...transport,
  })
}

/** 按账号名强退该用户全部在线设备（递增 credential_version，全部令牌立即失效）。 */
export function kickOnlineAccount(
  username: string,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/system/online-users/user/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    ...transport,
  })
}

/** 兼容别名：按单会话 jti 强退。 */
export const kickOnlineUser = kickOnlineSession
