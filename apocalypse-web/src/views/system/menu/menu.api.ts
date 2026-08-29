/** 菜单管理端点（perms：system:menu:list/add/edit/remove；写端点为 RESTful 约定）。 */

import { request } from '@/lib/api/client'
import type { SnowflakeId } from '@/lib/api/types'

import type { MenuSaveReq, RawMenuTreeNode } from './menu.types'

/** 全量菜单树（管理端）。 */
export function getMenuTree(): Promise<RawMenuTreeNode[]> {
  return request<RawMenuTreeNode[]>('/system/menus/tree')
}

/** 新增菜单，返回主键（雪花 string）。 */
export function createMenu(body: MenuSaveReq): Promise<SnowflakeId> {
  return request<SnowflakeId>('/system/menus', { method: 'POST', body })
}

export function updateMenu(id: SnowflakeId, body: MenuSaveReq): Promise<void> {
  return request<void>(`/system/menus/${id}`, { method: 'PUT', body })
}

/** 删除（逻辑删；存在子菜单时后端拒绝）。 */
export function deleteMenu(id: SnowflakeId): Promise<void> {
  return request<void>(`/system/menus/${id}`, { method: 'DELETE' })
}
