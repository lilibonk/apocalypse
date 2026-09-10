import type { MenuNode } from '@/lib/api/types'

/** 只根据后端最新菜单树判断某个编译期能力是否仍对当前身份开放。 */
export function hasMenuModule(menus: MenuNode[], moduleKey: string): boolean {
  return menus.some(
    (menu) => menu.moduleKey === moduleKey || hasMenuModule(menu.children, moduleKey),
  )
}
