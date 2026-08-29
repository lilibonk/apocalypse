/**
 * 区块/按钮级权限包裹组件：无权限时不渲染（默认）或渲染 fallback。
 * perms 命名约定：域:对象:动作（如 system:user:add）。
 * RequirePerm 为历史别名，新代码一律用 <Perm>。
 */

import type { ReactNode } from 'react'

import { usePerm } from '@/hooks/usePerm'

export function Perm({
  perm,
  children,
  fallback = null,
}: {
  perm: string
  children: ReactNode
  fallback?: ReactNode
}) {
  const allowed = usePerm(perm)
  return allowed ? children : fallback
}

/** 历史别名（等价 <Perm>），存量引用可平滑迁移。 */
export { Perm as RequirePerm }
