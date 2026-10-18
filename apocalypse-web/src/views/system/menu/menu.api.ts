/** 菜单管理端点（perms：system:menu:list/add/edit/remove；写端点为 RESTful 约定）。 */

import { request } from '@/lib/api/client'
import type { ScopedRequest } from '@/lib/query/module-scope'
import type { SnowflakeId } from '@/lib/api/types'

import type { MenuSaveReq, RawMenuTreeNode } from './menu.types'

/** 全量菜单树（管理端）。 */
export function getMenuTree(): Promise<RawMenuTreeNode[]> {
  return request<RawMenuTreeNode[]>('/system/menus/tree')
}

/** 新增菜单，返回主键（雪花 string）。 */
export function createMenu(body: MenuSaveReq, transport?: ScopedRequest): Promise<SnowflakeId> {
  return request<SnowflakeId>('/system/menus', { method: 'POST', body, ...transport })
}

export function updateMenu(
  id: SnowflakeId,
  body: MenuSaveReq,
  transport?: ScopedRequest,
): Promise<void> {
  return request<void>(`/system/menus/${id}`, { method: 'PUT', body, ...transport })
}

/** 删除（逻辑删；存在子菜单时后端拒绝）。 */
export function deleteMenu(id: SnowflakeId, transport?: ScopedRequest): Promise<void> {
  return request<void>(`/system/menus/${id}`, { method: 'DELETE', ...transport })
}
