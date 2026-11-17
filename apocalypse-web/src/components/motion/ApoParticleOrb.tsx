import { useEffect, useRef, useState } from 'react'

import { useMotionPreference } from '@/hooks/useMotionPreference'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

const POINT_COUNT = 128
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

interface LatticePoint {
  x: number
  y: number
  z: number
  phase: number
}

const SPHERE_POINTS: readonly LatticePoint[] = Array.from({ length: POINT_COUNT }, (_, idx) => {
  const y = 1 - (idx / (POINT_COUNT - 1)) * 2
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = GOLDEN_ANGLE * idx
  return {
    x: Math.cos(theta) * radius,
    y,
    z: Math.sin(theta) * radius,
    phase: idx * 0.27,
  }
})

export interface ApoParticleOrbProps {
  size?: number
  active?: boolean
  boostKey?: string | number
  className?: string
}

/**
 * 轻量 Canvas 2D Fibonacci 三维点云微球（`<ApoParticleOrb />`）。
 * 绝不导入 `three`；读取 CSS token 配色；
 * 遵循 `idle rAF === 0`：默认静止渲染高清首帧，仅在 `active`、交互脉冲期或悬停且允许动效、页签可见时旋转。
 */
function getOrbContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d')
  } catch {
    return null
  }
}

export function ApoParticleOrb({
  size = 24,
  active = false,
  boostKey,
  className,
}: ApoParticleOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { themeWorld } = useSettings()
  const motionAllowed = useMotionPreference()
  const [hovered, setHovered] = useState(false)
  const [boostActive, setBoostActive] = useState(false)

  useEffect(() => {
    if (boostKey === undefined || !motionAllowed) return
    const startTimer = window.setTimeout(() => setBoostActive(true), 0)
    const endTimer = window.setTimeout(() => setBoostActive(false), 900)
    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(endTimer)
    }
  }, [boostKey, motionAllowed])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof window === 'undefined') return

    const context = getOrbContext(canvas)
    if (!context) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelSize = Math.round(size * dpr)
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize
      canvas.height = pixelSize
    }

    const styles = getComputedStyle(document.documentElement)
    const coreColor = styles.getPropertyValue('--orb-core').trim() || 'currentColor'
    const accentColor = styles.getPropertyValue('--orb-accent').trim() || coreColor
    const ringColor = styles.getPropertyValue('--orb-ring').trim() || coreColor
    const eyeColor = styles.getPropertyValue('--orb-eye').trim() || coreColor
    const haloColor = styles.getPropertyValue('--orb-halo').trim() || coreColor
    const haloFade = styles.getPropertyValue('--orb-halo-fade').trim() || 'transparent'

    const drawFrame = (rotation: number, now: number) => {
      const cw = pixelSize
      const ch = pixelSize
      const cx = cw * 0.5
      const cy = ch * 0.5
      const radius = cw * 0.34

      context.clearRect(0, 0, cw, ch)

      const grad = context.createRadialGradient(
        cx,
        cy,
        Math.max(1, radius * 0.1),
        cx,
        cy,
        radius * 1.28,
      )
      grad.addColorStop(0, haloColor)
      grad.addColorStop(1, haloFade)
      context.fillStyle = grad
      context.beginPath()
      context.arc(cx, cy, radius * 1.28, 0, Math.PI * 2)
      context.fill()

      // Tilted orbital starlight ring & satellite sparks
      context.save()
      context.translate(cx, cy)
      context.rotate(-0.42 + Math.sin(rotation * 0.5) * 0.05)
      context.strokeStyle = ringColor
      context.lineWidth = Math.max(1, 1.25 * dpr)
      context.beginPath()
      context.ellipse(0, 0, radius * 1.34, radius * 0.42, 0, 0, Math.PI * 2)
      context.stroke()

      for (let s = 0; s < 3; s += 1) {
        const theta = rotation * 1.35 + (s * Math.PI * 2) / 3
        const sx = Math.cos(theta) * radius * 1.34
        const sy = Math.sin(theta) * radius * 0.42
        context.fillStyle = s === 0 ? accentColor : coreColor
        context.globalAlpha = sy >= 0 ? 0.94 : 0.46
        context.beginPath()
        context.arc(sx, sy, Math.max(0.8, (s === 0 ? 1.85 : 1.2) * dpr), 0, Math.PI * 2)
        context.fill()
      }
      context.restore()
      context.globalAlpha = 1

      const cosR = Math.cos(rotation)
      const sinR = Math.sin(rotation)
      const tilt = 0.38
      const cosT = Math.cos(tilt)
      const sinT = Math.sin(tilt)

      const projected: Array<{
        px: number
        py: number
        z2: number
        depth: number
        accent: boolean
      }> = []

      for (let i = 0; i < SPHERE_POINTS.length; i++) {
        const pt = SPHERE_POINTS[i]
        const x1 = pt.x * cosR - pt.z * sinR
        const z1 = pt.x * sinR + pt.z * cosR
        const y2 = pt.y * cosT - z1 * sinT
        const z2 = pt.y * sinT + z1 * cosT
        const pulse = motionAllowed ? 1 + 0.06 * Math.sin(now * 0.003 + pt.phase) : 1
        const depth = (z2 + 1.35) / 2.35
        projected.push({
          px: cx + x1 * radius * pulse,
          py: cy + y2 * radius * pulse,
          z2,
          depth,
          accent: i % 3 === 0,
        })
      }

      projected.sort((a, b) => a.z2 - b.z2)

      for (const dot of projected) {
        const dotR = Math.max(0.7, (0.78 + dot.depth * 1.32) * dpr)
        context.globalAlpha = Math.max(0.24, Math.min(0.96, 0.28 + dot.depth * 0.7))
        context.fillStyle = dot.accent ? accentColor : coreColor
        context.beginPath()
        context.arc(dot.px, dot.py, dotR, 0, Math.PI * 2)
        context.fill()
      }

      if (size >= 20) {
        const eyeOffsetX = radius * 0.3
        const eyeY = cy - radius * 0.06
        const eyeRadius = Math.max(1.8, radius * 0.16)
        context.globalAlpha = 0.94
        context.strokeStyle = eyeColor
        context.lineWidth = Math.max(1.2, (size >= 36 ? 2.1 : 1.5) * dpr)
        context.lineCap = 'round'
        for (const sign of [-1, 1]) {
          context.beginPath()
          context.arc(
            cx + sign * eyeOffsetX,
            eyeY + eyeRadius * 0.35,
            eyeRadius,
            Math.PI * 1.18,
            Math.PI * 1.82,
          )
          context.stroke()
        }
      }
      context.globalAlpha = 1
    }

    drawFrame(0.45, 0)

    const shouldAnimate = motionAllowed && (active || hovered || boostActive) && !document.hidden
    if (!shouldAnimate) return

    let frameId = 0
    let rot = 0.45

    const tick = (now: number) => {
      if (document.hidden) {
        frameId = 0
        return
      }
      rot += boostActive ? 0.055 : 0.018
      drawFrame(rot, now)
      frameId = window.requestAnimationFrame(tick)
    }

    const handleVisibility = () => {
      if (document.hidden && frameId) {
        window.cancelAnimationFrame(frameId)
        frameId = 0
      } else if (!document.hidden && !frameId) {
        frameId = window.requestAnimationFrame(tick)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    frameId = window.requestAnimationFrame(tick)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [active, boostActive, hovered, motionAllowed, size, themeWorld])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-slot="apo-particle-orb"
      data-active={active || hovered || boostActive ? 'true' : 'false'}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ width: size, height: size }}
      className={cn('block shrink-0', className)}
    />
  )
}
