import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'

import { insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'

interface AnimatedNumberProps {
  value: number
  language?: 'zh' | 'en'
  motionEnabled?: boolean
  decimals?: number
  className?: string
}

/** Display an already verified number; unavailable or empty sources are handled by the caller. */
export function AnimatedNumber({
  value,
  language = 'zh',
  motionEnabled,
  decimals = 0,
  className,
}: AnimatedNumberProps) {
  const preference = useMotionPreference()
  const enabled = preference && motionEnabled !== false
  const current = useMotionValue(value)
  const formatter = new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  const displayed = useTransform(current, (number) => formatter.format(number))

  useEffect(() => {
    if (!enabled) {
      current.stop()
      current.set(value)
      return
    }
    const playback = animate(current, value, insightMotion.number)
    return () => playback.stop()
  }, [current, enabled, value])

  if (!enabled) return <span className={className}>{formatter.format(value)}</span>
  return (
    <span className={className}>
      <motion.span aria-hidden="true">{displayed}</motion.span>
      <span className="sr-only">{formatter.format(value)}</span>
    </span>
  )
}
