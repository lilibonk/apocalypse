/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 *
 * Retro Grid —— 合成波地平网格氛围背景（纯 CSS 渐变 + keyframes，无 JS 引擎）。
 *
 * 来源：Magic UI — Retro Grid
 * 原文：https://github.com/magicuidesign/magicui/blob/b7443b4780af83a6fe064010a4c6a839202b81d1/apps/www/registry/magicui/retro-grid.tsx
 * 许可：MIT License（Magic UI © magicui.design）
 * 适配说明：
 * - 取 2025-09 的纯 CSS 变体。react-bits 的 Aurora 依赖 ogl、Magic UI main 分支的
 *   Retro Grid 现行版已重写为原生 WebGL——两者均越出 AGENTS.md §5 引擎分域
 *   （WebGL 属 2 期预留域，views/components 只允许 CSS + motion），故取该历史版本。
 * - 线色由 light/dark 双 props 收敛为单一 CSS 变量 --retro-grid-line，默认由
 *   color-mix(in oklab, var(--brand) …, transparent) 派生（token-only，暗色自动成立）；
 *   底部淡出由 from-white/dark:from-black 字面量改为 from-background 语义 token。
 * - 平面几何与滚动 keyframes 收进同目录 RetroGrid.css，JSX 不再堆 arbitrary values。
 * - 降级（双开关：prefers-reduced-motion 或设置面板「动画」关闭）时不挂滚动动画类，
 *   静态网格即最终形态；CSS 全局兜底见 design/tokens.css。
 */

import { useReducedMotion } from 'motion/react'
import type { CSSProperties, HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

import './RetroGrid.css'

export interface RetroGridProps extends HTMLAttributes<HTMLDivElement> {
  /** 附加到最外层容器。 */
  className?: string
  /** 网格平面俯仰角（度），默认 65。 */
  angle?: number
  /** 网格单元边长（px），默认 60。 */
  cellSize?: number
  /** 整体不透明度 0~1，默认 0.4（氛围层，保持克制）。 */
  opacity?: number
}

export function RetroGrid({
  className,
  angle = 65,
  cellSize = 60,
  opacity = 0.4,
  style,
  ...props
}: RetroGridProps) {
  const { motionEnabled } = useSettings()
  const reducedMotion = useReducedMotion()
  /** 降级：静态网格、零滚动（宪法 §5 双开关）。 */
  const staticMode = !motionEnabled || reducedMotion === true

  const gridStyles = {
    '--retro-grid-angle': `${angle}deg`,
    '--retro-grid-cell-size': `${cellSize}px`,
    opacity,
    ...style,
  } as CSSProperties

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute size-full overflow-hidden', className)}
      style={gridStyles}
      {...props}
    >
      <div className="retro-grid-stage">
        <div className="retro-grid-tilt">
          <div className={cn('retro-grid-plane', !staticMode && 'retro-grid-plane--scroll')} />
        </div>
      </div>
      {/* 底部淡出，让网格沉进页面底色，不抢前景内容 */}
      <div className="absolute inset-0 bg-linear-to-t from-background to-transparent to-90%" />
    </div>
  )
}
