/** 部门管理端点（perms：system:dept:list/add/edit/remove）。页面局部封装，仅限本视图目录使用。 */

import { request } from '@/lib/api/client'
import type { SnowflakeId } from '@/lib/api/types'

import type { DeptSaveReq, DeptTreeNode } from './types'

/** 全量部门树。 */
export function getDeptTree(): Promise<DeptTreeNode[]> {
  return request<DeptTreeNode[]>('/system/depts/tree')
}

/** 新增部门，返回主键（雪花 string）。 */
export function createDept(body: DeptSaveReq): Promise<SnowflakeId> {
  return request<SnowflakeId>('/system/depts', { method: 'POST', body })
}

export function updateDept(id: SnowflakeId, body: DeptSaveReq): Promise<void> {
  return request<void>(`/system/depts/${id}`, { method: 'PUT', body })
}

/** 删除（逻辑删；存在子部门或挂接用户时后端拒绝）。 */
export function deleteDept(id: SnowflakeId): Promise<void> {
  return request<void>(`/system/depts/${id}`, { method: 'DELETE' })
}
