/**
 * 在线用户端点（页面局部）。
 * GET /system/online-users → List（非分页）；DELETE /system/online-users/{jti} 按该会话定位账号并强退其全部设备。
 * jti 是 string 主键，原样拼路径。
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

/** 在线用户列表（List 非分页）。 */
export function listOnlineUsers(options?: { signal?: AbortSignal }): Promise<OnlineUserRow[]> {
  return request<OnlineUserRow[]>('/system/online-users', { signal: options?.signal })
}

/** 按会话定位账号；该账号全部现有登录与刷新令牌失效。 */
export function kickOnlineUser(
  jti: string,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/system/online-users/${jti}`, { method: 'DELETE', ...transport })
}
