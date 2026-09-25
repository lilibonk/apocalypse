/**
 * 页面过渡：克制的微动效（淡入 + 轻微上移）。
 *
 * 动效治理：
 * - 设置面板「动画」关闭时直接透传；
 * - prefers-reduced-motion 时直接透传（motion 的 useReducedMotion）；
 * - 全局 CSS 兜底见 design/tokens.css。
 * 品牌动效元素（PixelOrb / PixelWave）不经过本组件，见 effects/README.md 与 effects/PixelOrb/。
 */

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { motionGeometry, motionTransition } from '@/design/motion'
import { useMotionPolicy } from '@/hooks/useMotionPolicy'

export function PageTransition({ children }: { children: ReactNode }) {
  const { motionActive } = useMotionPolicy()

  if (!motionActive) {
    return children
  }

  return (
    <motion.div
      data-slot="page-transition"
      initial={{ opacity: 0, y: motionGeometry.pageOffset }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition.standard}
    >
      {children}
    </motion.div>
  )
}
