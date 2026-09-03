import type { MenuNode } from '@/lib/api/types'

/** 只根据后端最新菜单树判断某个编译期能力是否仍对当前身份开放。 */
export function hasMenuModule(menus: MenuNode[], moduleKey: string): boolean {
  return menus.some(
    (menu) => menu.moduleKey === moduleKey || hasMenuModule(menu.children, moduleKey),
  )
}

/** React Query 的模块缓存统一以稳定 module key 作为首段。 */
export function belongsToModuleQuery(queryKey: readonly unknown[], moduleKey: string): boolean {
  return queryKey[0] === moduleKey
}
