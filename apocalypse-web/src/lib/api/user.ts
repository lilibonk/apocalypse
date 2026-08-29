/** 用户管理端点（perms：system:user:list/add/edit/remove）。 */

import { request } from './client'
import type { PageResult, SnowflakeId, UserCreateReq, UserInfo, UserUpdateReq } from './types'

export function pageUsers(
  page: number,
  size: number,
  keyword?: string,
): Promise<PageResult<UserInfo>> {
  return request<PageResult<UserInfo>>('/system/users/page', {
    query: { page, size, keyword: keyword || undefined },
  })
}

export function getUser(id: SnowflakeId): Promise<UserInfo> {
  return request<UserInfo>(`/system/users/${id}`)
}

export function createUser(body: UserCreateReq): Promise<UserInfo> {
  return request<UserInfo>('/system/users', { method: 'POST', body })
}

export function updateUser(id: SnowflakeId, body: UserUpdateReq): Promise<UserInfo> {
  return request<UserInfo>(`/system/users/${id}`, { method: 'PUT', body })
}

export function deleteUser(id: SnowflakeId): Promise<void> {
  return request<void>(`/system/users/${id}`, { method: 'DELETE' })
}
