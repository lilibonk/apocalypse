/**
 * Blur Text —— 逐词/逐字模糊揭示入场（引擎：motion，已装且属通用 UI 动效域）。
 *
 * 来源：React Bits — Blur Text
 * 原文：https://github.com/DavidHDev/react-bits/blob/main/src/ts-tailwind/TextAnimations/BlurText/BlurText.tsx
 * 许可：MIT + Commons Clause（React Bits © David Haz；允许随应用/产品自由使用与修改，
 *       禁止把组件本身单独转售/再分发——本仓库为应用内使用，合规）
 * 适配说明：
 * - 根元素由 <p> 改为 <span>（块级/标题语义交给调用方，可合法嵌进 h1 等品牌标题）。
 * - 降级：prefers-reduced-motion 或设置面板「动画」关闭（motionEnabled=false）任一
 *   命中时直出静态文本（AGENTS.md §5 双开关，降级=静态形态）。
 * - className 走 cn() 合并；保留原版 IntersectionObserver 入视口触发逻辑与全部参数。
 */

import { motion, useReducedMotion, type Easing, type Transition } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

export interface BlurTextProps {
  text?: string
  /** 相邻分词/分字的入场间隔（ms），默认 200。 */
  delay?: number
  className?: string
  /** 按词或按字切分，默认 'words'；CJK 无空格文本建议 'letters'。 */
  animateBy?: 'words' | 'letters'
  direction?: 'top' | 'bottom'
  threshold?: number
  rootMargin?: string
  animationFrom?: Record<string, string | number>
  animationTo?: Array<Record<string, string | number>>
  easing?: Easing | Easing[]
  onAnimationComplete?: () => void
  stepDuration?: number
}

function buildKeyframes(
  from: Record<string, string | number>,
  steps: Array<Record<string, string | number>>,
): Record<string, Array<string | number>> {
  const keys = new Set<string>([...Object.keys(from), ...steps.flatMap((s) => Object.keys(s))])

  const keyframes: Record<string, Array<string | number>> = {}
  keys.forEach((k) => {
    keyframes[k] = [from[k], ...steps.map((s) => s[k])]
  })
  return keyframes
}

export function BlurText({
  text = '',
  delay = 200,
  className = '',
  animateBy = 'words',
  direction = 'top',
  threshold = 0.1,
  rootMargin = '0px',
  animationFrom,
  animationTo,
  easing = (t: number) => t,
  onAnimationComplete,
  stepDuration = 0.35,
}: BlurTextProps) {
  const { motionEnabled } = useSettings()
  const reducedMotion = useReducedMotion()
  /** 降级：静态文本、零动画（宪法 §5 双开关）。 */
  const staticMode = !motionEnabled || reducedMotion === true

  const elements = animateBy === 'words' ? text.split(' ') : text.split('')
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (staticMode) return
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.unobserve(element)
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [staticMode, threshold, rootMargin])

  const defaultFrom = useMemo(
    () =>
      direction === 'top'
        ? { filter: 'blur(10px)', opacity: 0, y: -50 }
        : { filter: 'blur(10px)', opacity: 0, y: 50 },
    [direction],
  )

  const defaultTo = useMemo(
    () => [
      {
        filter: 'blur(5px)',
        opacity: 0.5,
        y: direction === 'top' ? 5 : -5,
      },
      { filter: 'blur(0px)', opacity: 1, y: 0 },
    ],
    [direction],
  )

  const fromSnapshot = animationFrom ?? defaultFrom
  const toSnapshots = animationTo ?? defaultTo

  const stepCount = toSnapshots.length + 1
  const totalDuration = stepDuration * (stepCount - 1)
  const times = Array.from({ length: stepCount }, (_, i) =>
    stepCount === 1 ? 0 : i / (stepCount - 1),
  )

  if (staticMode) {
    return <span className={className}>{text}</span>
  }

  return (
    <span ref={ref} className={cn('flex flex-wrap', className)}>
      {elements.map((segment, index) => {
        const animateKeyframes = buildKeyframes(fromSnapshot, toSnapshots)

        const spanTransition: Transition = {
          duration: totalDuration,
          times,
          delay: (index * delay) / 1000,
          ease: easing,
        }

        return (
          <motion.span
            key={index}
            initial={fromSnapshot}
            animate={inView ? animateKeyframes : fromSnapshot}
            transition={spanTransition}
            onAnimationComplete={index === elements.length - 1 ? onAnimationComplete : undefined}
            style={{
              display: 'inline-block',
              willChange: 'transform, filter, opacity',
            }}
          >
            {segment === ' ' ? ' ' : segment}
            {animateBy === 'words' && index < elements.length - 1 && ' '}
          </motion.span>
        )
      })}
    </span>
  )
}
