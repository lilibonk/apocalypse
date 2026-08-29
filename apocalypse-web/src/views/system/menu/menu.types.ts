/**
 * 菜单管理页局部类型（契约事实来源：后端 system/menu 的 MenuTreeNode / MenuSaveReq）。
 *
 * 两处与直觉不符的契约，阅读本页代码前先知道：
 * - 树响应字段是 `type` 而非 `menuType`（normalize 时两者兼容）；
 * - visible/status 已随树返回（后端 MenuTreeNode 已补），
 *   页面仍按可选处理：列展示回退 '-'，编辑回填回退「显示/正常」默认值。
 */

import type { SnowflakeId } from '@/lib/api/types'

/** 菜单类型：C=目录 M=菜单 F=按钮。 */
export type MenuType = 'C' | 'M' | 'F'

/** 根节点 parentId 约定（后端以 parentId=0 为根，雪花 id 在 JSON 中是 string）。 */
export const ROOT_PARENT_ID = '0'

/** GET /system/menus/tree 的原始节点（字段名兼容 type/menuType；visible/status 视后端返回而定）。 */
export interface RawMenuTreeNode {
  id: SnowflakeId
  parentId: SnowflakeId
  menuName: string
  type?: MenuType
  menuType?: MenuType
  path?: string | null
  component?: string | null
  perms?: string | null
  icon?: string | null
  sort?: number | null
  visible?: number | null
  status?: number | null
  remark?: string | null
  children?: RawMenuTreeNode[] | null
}

/** 页面内部使用的归一化节点。 */
export interface MenuNode {
  id: SnowflakeId
  parentId: SnowflakeId
  menuName: string
  menuType: MenuType
  path: string | null
  component: string | null
  perms: string | null
  icon: string | null
  sort: number
  visible: number | null
  status: number | null
  remark: string | null
  children: MenuNode[]
}

/** 保存请求（POST /system/menus 与 PUT /system/menus/{id} 共用，对应后端 MenuSaveReq）。 */
export interface MenuSaveReq {
  parentId: SnowflakeId
  menuName: string
  menuType: MenuType
  path?: string
  component?: string
  perms?: string
  icon?: string
  sort?: number
  visible?: number
  status?: number
  remark?: string
}

/** 原始树节点 → 页面归一化节点（字段名兼容在此收敛）。 */
export function normalizeMenuTreeNode(raw: RawMenuTreeNode): MenuNode {
  return {
    id: raw.id,
    parentId: raw.parentId,
    menuName: raw.menuName,
    menuType: raw.menuType ?? raw.type ?? 'M',
    path: raw.path ?? null,
    component: raw.component ?? null,
    perms: raw.perms ?? null,
    icon: raw.icon ?? null,
    sort: raw.sort ?? 0,
    visible: raw.visible ?? null,
    status: raw.status ?? null,
    remark: raw.remark ?? null,
    children: (raw.children ?? []).map(normalizeMenuTreeNode),
  }
}

/** 收集节点及全部后代的 id（编辑时上级选择需排除自身子树，防止成环）。 */
export function collectSubtreeIds(node: MenuNode): Set<string> {
  const ids = new Set<string>()
  const walk = (current: MenuNode) => {
    ids.add(current.id)
    current.children.forEach(walk)
  }
  walk(node)
  return ids
}
