import { useEffect, useRef } from 'react'

import { useMotionPreference } from '@/hooks/useMotionPreference'
import { cn } from '@/lib/utils'

export interface SketchApoPeekerProps {
  className?: string
}

/**
 * 卡片边缘矢量小角色（`<SketchApoPeeker />`）：
 * 纯 SVG 矢量路径 + token 填充，跟随指针微调瞳孔焦点，关闭动画时静止停帧，零外部位图请求。
 */
export function SketchApoPeeker({ className }: SketchApoPeekerProps) {
  const motionAllowed = useMotionPreference()
  const rootRef = useRef<SVGSVGElement>(null)
  const leftPupilRef = useRef<SVGCircleElement>(null)
  const rightPupilRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    if (!motionAllowed) return
    const svg = rootRef.current
    const leftEye = leftPupilRef.current
    const rightEye = rightPupilRef.current
    if (!svg || !leftEye || !rightEye) return

    let frame = 0
    let latestEvent: PointerEvent | null = null

    const applyGaze = () => {
      frame = 0
      if (!latestEvent) return
      const rect = svg.getBoundingClientRect()
      const cx = rect.left + rect.width * 0.5
      const cy = rect.top + rect.height * 0.5
      const dx = Math.max(-1, Math.min(1, (latestEvent.clientX - cx) / 160))
      const dy = Math.max(-1, Math.min(1, (latestEvent.clientY - cy) / 120))
      leftEye.setAttribute('cx', (22.5 + dx * 2.1).toFixed(2))
      leftEye.setAttribute('cy', (18.5 + dy * 1.3).toFixed(2))
      rightEye.setAttribute('cx', (35.0 + dx * 2.1).toFixed(2))
      rightEye.setAttribute('cy', (18.0 + dy * 1.3).toFixed(2))
    }

    const handleMove = (event: PointerEvent) => {
      latestEvent = event
      if (!frame) frame = window.requestAnimationFrame(applyGaze)
    }

    window.addEventListener('pointermove', handleMove, { passive: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', handleMove)
    }
  }, [motionAllowed])

  return (
    <svg
      ref={rootRef}
      width={56}
      height={34}
      viewBox="0 0 56 34"
      aria-hidden="true"
      data-slot="sketch-apo-peeker"
      className={cn('pointer-events-none select-none', className)}
    >
      <ellipse cx="28" cy="31" rx="20" ry="3" fill="var(--conduit-shadow)" />
      <path
        d="M6 31 C5 19, 8 9, 17 7 C22 6, 24 10, 29 9 C35 8, 39 3, 45 7 C51 11, 51 21, 50 31 Z"
        fill="var(--peeker-body)"
        stroke="var(--sketch-ink)"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <ellipse cx="17" cy="23" rx="4.2" ry="2.6" fill="var(--peeker-cheek)" opacity="0.72" />
      <ellipse cx="40" cy="22" rx="4.2" ry="2.6" fill="var(--peeker-cheek)" opacity="0.72" />
      <circle cx="22.5" cy="18.5" r="2.7" fill="var(--card)" />
      <circle cx="35" cy="18" r="2.7" fill="var(--card)" />
      <circle ref={leftPupilRef} cx="22.8" cy="18.5" r="2.05" fill="var(--peeker-eye)" />
      <circle ref={rightPupilRef} cx="35.3" cy="18" r="2.05" fill="var(--peeker-eye)" />
      <circle cx="22.2" cy="17.7" r="0.65" fill="var(--card)" />
      <circle cx="34.7" cy="17.2" r="0.65" fill="var(--card)" />
      <path
        d="M26.5 21.5 Q29 24 31.5 21.3"
        fill="none"
        stroke="var(--peeker-eye)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="14"
        cy="30.5"
        rx="4.5"
        ry="2.3"
        fill="var(--peeker-paw)"
        stroke="var(--sketch-ink)"
        strokeWidth="1.35"
      />
      <ellipse
        cx="42"
        cy="30.5"
        rx="4.5"
        ry="2.3"
        fill="var(--peeker-paw)"
        stroke="var(--sketch-ink)"
        strokeWidth="1.35"
      />
    </svg>
  )
}
