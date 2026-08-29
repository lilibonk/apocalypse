/**
 * 菜单图标：后端 menus.icon 存 lucide 图标名（小写短横线），这里做受控映射。
 * 不在映射表内的名字回落为通用模块图标，避免整棵 lucide 打进 bundle，
 * 也避免未知配置在侧栏里退化成一串难以区分的圆点。
 */

import { createElement } from 'react'

import { resolveMenuIcon } from './menu-icons'

export function MenuIcon({ name, className }: { name: string | null; className?: string }) {
  return createElement(resolveMenuIcon(name), { className: className ?? 'size-4 shrink-0' })
}
