/**
 * 浮层内容序列：让标题、字段与操作按阅读顺序短促进入。
 * 只用于 Dialog / Sheet / 详情卡片等小规模信息组，不用于表格行或长列表。
 */

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { motionSequence, motionTransition } from '@/design/motion'
import { useSettings } from '@/stores/settings'

const sequenceVariants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: motionSequence.delay,
      staggerChildren: motionSequence.stagger,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: motionTransition.enter },
}

export function MotionSequence({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { motionEnabled } = useSettings()
  const reducedMotion = useReducedMotion()

  if (!motionEnabled || reducedMotion) {
    return (
      <div data-slot="motion-sequence" className={className}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      data-slot="motion-sequence"
      className={className}
      initial="hidden"
      animate="visible"
      variants={sequenceVariants}
    >
      {children}
    </motion.div>
  )
}

export function MotionSequenceItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div data-slot="motion-sequence-item" className={className} variants={itemVariants}>
      {children}
    </motion.div>
  )
}
