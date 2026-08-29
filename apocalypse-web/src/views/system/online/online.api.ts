/**
 * 在线用户端点（页面局部）。
 * GET /system/online-users → List（非分页）；DELETE /system/online-users/{jti} 强退会话。
 * jti 是 string 主键，原样拼路径。
 */

import { request } from '@/lib/api/client'

/** 在线用户会话（对应后端 OnlineUserResp）。 */
export type OnlineUserRow = {
  jti: string
  username: string
  loginTime: string
  ip: string | null
  userAgent: string | null
}

/** 在线用户列表（List 非分页）。 */
export function listOnlineUsers(): Promise<OnlineUserRow[]> {
  return request<OnlineUserRow[]>('/system/online-users')
}

/** 强退指定会话（删在线条目 + jti 入黑名单）。 */
export function kickOnlineUser(jti: string): Promise<void> {
  return request<void>(`/system/online-users/${jti}`, { method: 'DELETE' })
}
