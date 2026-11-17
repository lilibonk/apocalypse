import { Children, isValidElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { EntityReturnPill } from './EntityPill'
import type { EntitySourceRef } from './entity-intent'

export interface LivingContextBarProps {
  /** 来源面包屑引用：非空时在最左侧渲染 <EntityReturnPill source={source} /> */
  source?: EntitySourceRef | null
  /** 脉络条标题（默认“关联脉络”） */
  title?: string
  /** 无障碍区域标签（默认同 title 或“关联脉络”） */
  ariaLabel?: string
  /** 关联实体胶囊组（紧凑 EntityPill 子节点） */
  children?: ReactNode
  /** 右侧附加的轻量操作或说明槽位 */
  actions?: ReactNode
  className?: string
}

/**
 * 顶置上下文流转条（LivingContextBar）。
 * 统一承载“来源回跳（EntityReturnPill）+ 关联脉络（EntityPill 组）+ 右侧轻量操作”，
 * 彻底消灭检视栏/抽屉底部的生硬“关联直达”附着物，保证一屏第一眼可见可点。
 */
export function LivingContextBar({
  source,
  title = '关联脉络',
  ariaLabel,
  children,
  actions,
  className,
}: LivingContextBarProps) {
  const nonEmptyChildren = Children.toArray(children).filter(
    (child) =>
      Boolean(child) &&
      (isValidElement(child) || typeof child === 'string' || typeof child === 'number'),
  )

  if (!source && nonEmptyChildren.length === 0 && !actions) {
    return null
  }

  return (
    <div
      role="navigation"
      aria-label={ariaLabel ?? title ?? '关联脉络'}
      data-slot="living-context-bar"
      className={cn(
        'living-context-bar flex flex-wrap items-center justify-between gap-2 rounded-control border border-border-subtle bg-muted/40 px-3 py-1.5',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {source && <EntityReturnPill source={source} />}
        {source && nonEmptyChildren.length > 0 && (
          <span className="mx-0.5 h-3.5 w-px bg-border" aria-hidden="true" />
        )}
        {nonEmptyChildren.length > 0 && (
          <>
            {title && (
              <span
                data-slot="living-context-bar-title"
                className="mr-0.5 text-xs font-medium text-muted-foreground select-none"
              >
                {title}
              </span>
            )}
            <div
              data-slot="living-context-bar-pills"
              className="flex flex-wrap items-center gap-1.5"
            >
              {nonEmptyChildren}
            </div>
          </>
        )}
      </div>
      {actions && (
        <div data-slot="living-context-bar-actions" className="ml-auto flex items-center gap-1.5">
          {actions}
        </div>
      )}
    </div>
  )
}
