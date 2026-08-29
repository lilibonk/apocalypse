/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 *
 * 像素水面：连续高度场每帧贴格。Loading 用「水流泛起」，不是拆豆/棋盘。
 */

import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

import { composeTide, TIDE_H, TIDE_W } from './draw'
import { SKINS } from './skins'

export function PixelTide({ className }: { className?: string }) {
  const { motionEnabled, mascotSkin } = useSettings()
  const reducedMotion = useReducedMotion()
  const staticMode = !motionEnabled || reducedMotion === true
  const palette = SKINS[mascotSkin].palette
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const cssW = TIDE_W * 2
  const cssH = TIDE_H * 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const paint = (t: number) => {
      const rgba = composeTide(palette, staticMode ? 0 : t)
      const image = ctx.createImageData(TIDE_W, TIDE_H)
      image.data.set(rgba)
      ctx.putImageData(image, 0, 0)
    }

    paint(0)
    if (staticMode) return

    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      paint((now - t0) / 1000)
      raf = window.requestAnimationFrame(loop)
    }
    raf = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(raf)
  }, [palette, staticMode])

  return (
    <canvas
      ref={canvasRef}
      width={TIDE_W}
      height={TIDE_H}
      className={cn('shrink-0', className)}
      style={{ width: cssW, height: cssH, imageRendering: 'pixelated' }}
      aria-hidden
    />
  )
}
