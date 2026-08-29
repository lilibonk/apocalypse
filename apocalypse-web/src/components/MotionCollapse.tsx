/**
 * 通用折叠区域：用于真实的信息层级展开，不用于装饰数据卡片。
 * 同时尊重设置中的动画开关与 prefers-reduced-motion。
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { motionTransition } from '@/design/motion'
import { useSettings } from '@/stores/settings'

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
  const { motionEnabled } = useSettings()
  const reducedMotion = useReducedMotion()

  if (!motionEnabled || reducedMotion) {
    return open ? (
      <div id={id} className={className}>
        {children}
      </div>
    ) : null
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          data-slot="motion-collapse"
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
