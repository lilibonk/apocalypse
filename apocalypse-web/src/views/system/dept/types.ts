/** 部门管理页局部契约类型（对应后端 system.dept 的 DeptTreeNode / DeptSaveReq）。 */

import type { SnowflakeId } from '@/lib/api/types'

export type { SnowflakeId }

/** 根部门 parentId 约定（后端 parent_id=0 为根；装箱 Long 在 JSON 中是 string）。 */
export const ROOT_DEPT_ID: SnowflakeId = '0'

/** 部门树节点（GET /system/depts/tree 的 data 元素）。 */
export interface DeptTreeNode {
  id: SnowflakeId
  /** 父部门 id，根为 '0'。 */
  parentId: SnowflakeId
  deptName: string
  leader: string | null
  phone: string | null
  sort: number
  /** 1=正常 0=停用（字典 sys_user_status）。 */
  status: number
  remark: string | null
  children: DeptTreeNode[] | null
}

/** 部门保存请求（POST /system/depts、PUT /system/depts/{id} 共用；parentId/deptName 必填）。 */
export interface DeptSaveReq {
  parentId: SnowflakeId
  deptName: string
  leader?: string
  phone?: string
  sort?: number
  status?: number
  remark?: string
}
