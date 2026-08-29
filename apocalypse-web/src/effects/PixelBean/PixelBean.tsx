/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 *
 * PixelBean —— 连续肾形每帧栅格化（像素版的 Grok 微动）。
 *
 * 豆内是连续焦散水流，轮廓微波；每帧贴成整数格。
 * 全页 loading 不走本组件，见 PixelTide（像素水面泛起）。
 */

import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

import { composeFrame, poseForState } from './draw'
import { BEAN_NATIVE_HEIGHT, BEAN_NATIVE_WIDTH, beanUnit } from './size'
import { SKINS } from './skins'
import type { BeanState, SkinId } from './types'

export interface PixelBeanProps {
  state?: BeanState
  skin?: SkinId
  /**
   * CSS 宽（px）。必须是 64 的倍数。内部栅格恒为 128。
   * 侧栏 64、设置/空态 128、PageLoading/登录移动 256、登录桌面 512。
   */
  size?: number
  gaze?: boolean
  className?: string
}

const GAZE_RANGE = { x: 4, y: 2 } as const
const GAZE_SATURATION_PX = 220

export function PixelBean({
  state = 'idle',
  skin,
  size = 128,
  gaze = false,
  className,
}: PixelBeanProps) {
  const { motionEnabled, mascotSkin } = useSettings()
  const reducedMotion = useReducedMotion()
  const staticMode = !motionEnabled || reducedMotion === true

  const palette = SKINS[skin ?? mascotSkin].palette
  const unit = beanUnit(size)
  const cssW = BEAN_NATIVE_WIDTH * unit
  const cssH = BEAN_NATIVE_HEIGHT * unit

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const lookRef = useRef({ x: 0, y: 0 })
  const hopRef = useRef(0)
  const shakeRef = useRef(0)
  const pulseRef = useRef(false)

  const [blink, setBlink] = useState(false)

  const [prevState, setPrevState] = useState(state)
  if (prevState !== state) {
    setPrevState(state)
    setBlink(false)
  }

  useEffect(() => {
    hopRef.current = 0
    shakeRef.current = 0
  }, [state])

  useEffect(() => {
    if (!gaze || staticMode) return
    const onMove = (event: MouseEvent) => {
      const el = wrapRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const dx = event.clientX - (rect.left + rect.width / 2)
      const dy = event.clientY - (rect.top + rect.height / 2)
      const angle = Math.atan2(dy, dx)
      const reach = Math.min(1, Math.hypot(dx, dy) / GAZE_SATURATION_PX)
      lookRef.current = {
        x: Math.cos(angle) * GAZE_RANGE.x * reach,
        y: Math.sin(angle) * GAZE_RANGE.y * reach,
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [gaze, staticMode])

  useEffect(() => {
    if (staticMode || state !== 'idle') {
      return
    }
    let cancelled = false
    let timer: number | undefined
    const loop = () => {
      timer = window.setTimeout(
        () => {
          if (cancelled) return
          setBlink(true)
          timer = window.setTimeout(() => {
            if (cancelled) return
            setBlink(false)
            loop()
          }, 160)
        },
        2400 + Math.random() * 2800,
      )
    }
    loop()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [staticMode, state])

  useEffect(() => {
    if (staticMode || state !== 'thinking') return
    const timer = window.setInterval(() => {
      pulseRef.current = !pulseRef.current
    }, 700)
    return () => window.clearInterval(timer)
  }, [staticMode, state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const paint = (timeSec: number) => {
      if (state === 'success' && !staticMode) {
        const cycle = timeSec % 1.8
        hopRef.current = cycle < 0.35 ? Math.round(-10 * Math.sin((cycle / 0.35) * Math.PI)) : 0
      } else {
        hopRef.current = 0
      }
      if (state === 'error' && !staticMode) {
        shakeRef.current = Math.round(Math.sin(timeSec * 18) * 2)
      } else {
        shakeRef.current = 0
      }
      const pose = poseForState(state, blink)
      const rgba = composeFrame({
        pose,
        palette,
        squashY: 1,
        tilt: 0,
        time: staticMode ? 0 : timeSec,
        flowAmp: staticMode ? 0 : state === 'waiting' ? 0.9 : 0.7,
        lookX: gaze && !staticMode && pose === 'idle' ? lookRef.current.x : 0,
        lookY: gaze && !staticMode && pose === 'idle' ? lookRef.current.y : 0,
        hop: hopRef.current,
        corePulse: state === 'thinking' && !staticMode && pulseRef.current,
      })
      const image = ctx.createImageData(BEAN_NATIVE_WIDTH, BEAN_NATIVE_HEIGHT)
      image.data.set(rgba)
      ctx.putImageData(image, 0, 0)
      canvas.style.transform = `translate(${(staticMode ? 0 : shakeRef.current) * unit}px, 0px)`
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
  }, [state, palette, gaze, staticMode, blink, unit])

  return (
    <div
      ref={wrapRef}
      className={cn('relative shrink-0', className)}
      style={{ width: cssW, height: cssH }}
      aria-hidden
      data-state={state}
    >
      <canvas
        ref={canvasRef}
        width={BEAN_NATIVE_WIDTH}
        height={BEAN_NATIVE_HEIGHT}
        className="absolute left-0 top-0"
        style={{
          width: cssW,
          height: cssH,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  )
}
