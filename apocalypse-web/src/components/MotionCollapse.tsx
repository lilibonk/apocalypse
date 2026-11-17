/**
 * 通用折叠区域：用于真实的信息层级展开，不用于装饰数据卡片。
 * 同时尊重设置中的动画开关与 prefers-reduced-motion。
 */

import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

import { motionTransition } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'

export function MotionCollapse({
  open,
  children,
  className,
  id,
}: {
  open: boolean
  children: ReactNode
  className?: string
  id?: string
}) {
  const motionEnabled = useMotionPreference()

  if (!motionEnabled) {
    return open ? (
      <div id={id} data-state="open" className={className}>
        {children}
      </div>
    ) : null
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          data-slot="motion-collapse"
          data-state="open"
          key="content"
          id={id}
          initial="closed"
          animate="open"
          exit="closed"
          variants={{
            open: {
              height: 'auto',
              opacity: 1,
              transition: motionTransition.standard,
            },
            closed: {
              height: 0,
              opacity: 0,
              transition: motionTransition.exit,
            },
          }}
          className="overflow-hidden"
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
