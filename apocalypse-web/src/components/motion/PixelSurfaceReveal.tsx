/**
 * CRUD 浮层的一次性 PixelWave 揭幕。
 *
 * 先以纯 background 表面遮住内容，再让一个品牌色脉冲沿固定 PCB 主路传导并在
 * 焊点处分流；内容从中后段浮现。效果结束后卸载 Canvas，避免闲置时保留 rAF。
 */

import { useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import { PixelWave } from '@/effects/PixelWave'
import { useSettings } from '@/stores/settings'

const REVEAL_LIFETIME_MS = 840

export function PixelSurfaceReveal({ tone = 'brand' }: { tone?: 'brand' | 'destructive' }) {
  const { motionEnabled } = useSettings()
  const reducedMotion = useReducedMotion()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!motionEnabled || reducedMotion) return

    const timer = window.setTimeout(() => setVisible(false), REVEAL_LIFETIME_MS)
    return () => window.clearTimeout(timer)
  }, [motionEnabled, reducedMotion])

  if (!motionEnabled || reducedMotion || !visible) return null

  return (
    <div
      data-slot="pixel-surface-reveal"
      data-tone={tone}
      className="absolute inset-0 z-30 overflow-hidden bg-background"
      aria-hidden
    >
      <PixelWave appearance="circuit" waveSpeed={6} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
