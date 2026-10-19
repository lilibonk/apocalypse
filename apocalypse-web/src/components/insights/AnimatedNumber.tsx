import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'

import { insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'

import { OdometerNumber } from './OdometerNumber'

interface AnimatedNumberProps {
  value: number
  language?: 'zh' | 'en'
  motionEnabled?: boolean
  decimals?: number
  className?: string
  /** `tween` interpolates the value; `odometer` rolls each digit in its own reel (counts). */
  variant?: 'tween' | 'odometer'
}

/** Display an already verified number; unavailable or empty sources are handled by the caller. */
export function AnimatedNumber({
  value,
  language = 'zh',
  motionEnabled,
  decimals = 0,
  className,
  variant = 'tween',
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
    if (!enabled || variant === 'odometer') {
      current.stop()
      current.set(value)
      return
    }
    const playback = animate(current, value, insightMotion.number)
    return () => playback.stop()
  }, [current, enabled, value, variant])

  if (variant === 'odometer')
    return (
      <OdometerNumber formatted={formatter.format(value)} enabled={enabled} className={className} />
    )
  if (!enabled) return <span className={className}>{formatter.format(value)}</span>
  return (
    <span className={className}>
      <motion.span aria-hidden="true">{displayed}</motion.span>
      <span className="sr-only">{formatter.format(value)}</span>
    </span>
  )
}
