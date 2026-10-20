/**
 * 页面过渡：连贯的淡入与轻微上移，保持内容及时可读。
 *
 * 动效治理：
 * - 保持同一外层节点，偏好变化不重挂载页面或丢弃草稿；
 * - 产品动画关闭或系统减少动态时停止过渡并立即到终态；
 * - 全局 CSS 兜底见 design/tokens.css。
 * 品牌动效元素（PixelOrb / PixelWave）不经过本组件，见 effects/README.md 与 effects/PixelOrb/。
 */

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { motionGeometry, motionTransition } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'

export function PageTransition({ children }: { children: ReactNode }) {
  const enabled = useMotionPreference()
  const controls = useSurfaceAnimation({ opacity: 1, y: 0 }, enabled, motionTransition.standard)

  return (
    <motion.div
      data-slot="page-transition"
      initial={enabled ? { opacity: 0, y: motionGeometry.pageOffset } : false}
      animate={controls}
    >
      {children}
    </motion.div>
  )
}
