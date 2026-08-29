/**
 * Spotlight Card —— 鼠标/焦点跟随的径向渐变光斑容器（纯 CSS 渐变 + React 事件，无引擎）。
 *
 * 来源：React Bits — Spotlight Card
 * 原文：https://github.com/DavidHDev/react-bits/blob/main/src/ts-tailwind/Components/SpotlightCard/SpotlightCard.tsx
 * 许可：MIT + Commons Clause（React Bits © David Haz；允许随应用/产品自由使用与修改，
 *       禁止把组件本身单独转售/再分发——本仓库为应用内使用，合规）
 * 适配说明：
 * - 原版深色卡片外观（border-neutral-800 bg-neutral-900 rounded-3xl p-8）全部剥离：
 *   容器视觉完全交给调用方 className，本组件只提供结构（relative overflow-hidden）+ 光斑层。
 * - spotlightColor 由 rgba 模板字面量类型放宽为 string，默认
 *   color-mix(in oklab, var(--brand) 14%, transparent)——token 派生、低透明度克制，
 *   --brand 明暗双写（design/tokens.css），暗色模式同样成立。
 * - 降级：prefers-reduced-motion 或设置面板「动画」关闭（motionEnabled=false）任一
 *   命中时所有交互监听短路、光斑层恒透明（= 无 spotlight 的静态容器）。
 */

import { useReducedMotion } from 'motion/react'
import { useRef, useState, type MouseEventHandler, type PropsWithChildren } from 'react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

export interface SpotlightCardProps extends PropsWithChildren {
  className?: string
  /** 光斑颜色，默认由 --brand 低透明度派生（token-only）。 */
  spotlightColor?: string
}

export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'color-mix(in oklab, var(--brand) 14%, transparent)',
}: SpotlightCardProps) {
  const { motionEnabled } = useSettings()
  const reducedMotion = useReducedMotion()
  /** 降级：无光斑的静态容器（宪法 §5 双开关）。 */
  const staticMode = !motionEnabled || reducedMotion === true

  const divRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState<boolean>(false)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState<number>(0)

  const handleMouseMove: MouseEventHandler<HTMLDivElement> = (e) => {
    if (staticMode || !divRef.current || isFocused) return

    const rect = divRef.current.getBoundingClientRect()
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const handleFocus = () => {
    if (staticMode) return
    setIsFocused(true)
    setOpacity(0.6)
  }

  const handleBlur = () => {
    setIsFocused(false)
    setOpacity(0)
  }

  const handleMouseEnter = () => {
    if (staticMode) return
    setOpacity(0.6)
  }

  const handleMouseLeave = () => {
    setOpacity(0)
  }

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn('relative overflow-hidden', className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-in-out"
        style={{
          opacity,
          background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
        }}
      />
      {children}
    </div>
  )
}
