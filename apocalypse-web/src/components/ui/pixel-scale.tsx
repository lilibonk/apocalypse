/**
 * PixelScale —— 通用一维像素音阶加载指示器。
 *
 * 用于路由加载、按钮等待和确定/不确定进度；不进入表格正文。
 * 动画仅改变 transform / opacity，并以 CSS steps() 量化，保持 4px 像素语言。
 * 系统 prefers-reduced-motion 与 html[data-motion='off'] 由 tokens.css 统一降级。
 */

import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

export type PixelScaleVariant = 'inline' | 'card' | 'page'
export type PixelScaleTone = 'brand' | 'current'

export interface PixelScaleProps {
  /** inline = 按钮；card = 局部等待；page = 路由加载。 */
  variant?: PixelScaleVariant
  /** brand 使用 --primary；current 继承父级文字色，适合实色按钮。 */
  tone?: PixelScaleTone
  /** false 时显示静态音阶，可用于确定进度的停驻态。 */
  active?: boolean
  /** 提供时作为 status 的可访问名称；缺省时为纯装饰。 */
  label?: string
  className?: string
}

const BAR_COUNT: Record<PixelScaleVariant, number> = {
  inline: 6,
  card: 12,
  page: 16,
}

/** 静态帧也保留可读节奏；数值只驱动 scaleY，不参与布局。 */
const LEVELS = [0.34, 0.58, 0.82, 0.46, 1, 0.7, 0.42, 0.88] as const

const WRAP_CLASS: Record<PixelScaleVariant, string> = {
  inline: 'h-4 gap-0.5',
  card: 'h-6 gap-1',
  page: 'h-12 gap-1',
}

const BAR_CLASS: Record<PixelScaleVariant, string> = {
  inline: 'w-0.5',
  card: 'w-1',
  page: 'w-2',
}

type PixelScaleStyle = CSSProperties & {
  '--pixel-scale-index': number
  '--pixel-scale-level': number
}

export function PixelScale({
  variant = 'card',
  tone = 'brand',
  active = true,
  label,
  className,
}: PixelScaleProps) {
  const count = BAR_COUNT[variant]

  return (
    <div
      role={label ? 'status' : undefined}
      aria-live={label ? 'polite' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-effect="pixel-wave"
      data-appearance="scale"
      data-variant={variant}
      data-active={active}
      className={cn(
        'inline-flex shrink-0 items-end justify-center overflow-hidden',
        WRAP_CLASS[variant],
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => {
        const style: PixelScaleStyle = {
          '--pixel-scale-index': index,
          '--pixel-scale-level': LEVELS[index % LEVELS.length],
        }
        return (
          <span
            key={index}
            data-slot="pixel-scale-bar"
            className={cn(
              'h-full origin-bottom',
              BAR_CLASS[variant],
              tone === 'current' ? 'bg-current' : 'bg-primary',
            )}
            style={style}
          />
        )
      })}
    </div>
  )
}
