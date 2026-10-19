/**
 * 部门成员查询（复用用户分页，system:user:list）。deptId 与当前数据范围取交集，
 * includeChildren 按未删除的下级部门递归；只读。
 */

import { request } from '@/lib/api/client'
import type { PageResult, SnowflakeId } from '@/lib/api/types'

export interface DeptMember {
  id: SnowflakeId
  username: string
  nickname: string | null
  deptId: SnowflakeId | null
  deptName?: string | null
  status: number
}

export function pageDeptMembers(
  deptId: SnowflakeId,
  includeChildren: boolean,
  page: number,
  size: number,
  signal?: AbortSignal,
): Promise<PageResult<DeptMember>> {
  return request<PageResult<DeptMember>>('/system/users/page', {
    query: { deptId, includeChildren: includeChildren ? 'true' : 'false', page, size },
    signal,
  })
}
