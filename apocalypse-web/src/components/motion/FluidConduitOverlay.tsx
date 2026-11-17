import { useEffect, useState, type RefObject } from 'react'
import { motion } from 'motion/react'

import { unifiedMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

import { buildTwinBankRiver } from './procedural-geometry'

export interface ConduitLink {
  id: string
  from: string
  to: string
  enabled?: boolean
  scope?: 'ALL' | 'STANDARD' | 'BROKEN'
  fromOffsetY?: number
  toOffsetY?: number
}

interface MeasuredConduit {
  id: string
  enabled: boolean
  scope: 'ALL' | 'STANDARD' | 'BROKEN'
  gapScale: number
  centerD: string
  riverPoly: string
  topBank: string
  bottomBank: string
}

export interface FluidConduitOverlayProps {
  containerRef: RefObject<HTMLElement | null>
  links: readonly ConduitLink[]
  pulseKey?: string | number
  minContainerWidth?: number
  /** auto: 横向跨栏自动连线（堆叠时抑制跨卡竖穿），vertical: 纵轴阀门母线 */
  flow?: 'auto' | 'vertical' | 'horizontal'
  className?: string
}

function isAnchorVisibleInScrollAncestors(el: HTMLElement, root: HTMLElement): boolean {
  const er = el.getBoundingClientRect()
  const midY = er.top + er.height * 0.5
  const midX = er.left + er.width * 0.5
  let ancestor = el.parentElement
  while (ancestor && ancestor !== root) {
    const style = getComputedStyle(ancestor)
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      ancestor.scrollHeight > ancestor.clientHeight + 2
    ) {
      const pr = ancestor.getBoundingClientRect()
      if (midY < pr.top + 2 || midY > pr.bottom - 2) return false
    }
    if (/(auto|scroll)/.test(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth + 2) {
      const pr = ancestor.getBoundingClientRect()
      if (midX < pr.left + 2 || midX > pr.right - 2) return false
    }
    ancestor = ancestor.parentElement
  }
  return true
}

function safeControlSpan(gap: number, min: number, ratio: number): number {
  if (gap <= 2) return 0
  return Math.min(gap * 0.46, Math.max(min, gap * ratio))
}

/**
 * 参数化矢量活水管道覆盖层（`<FluidConduitOverlay />`）。
 * 依据 `[data-conduit-anchor]` 真实 DOM 边界测量绘制三主题同源矢量管道：
 * - `fluid`: 四层同源立体折射玻璃管
 * - `sketchbook`: 法向偏移双岸水彩河道 + `#watercolor-bleed` 湿边滤镜 + 涟漪
 * - `obsidian`: 生物荧光等离子细丝（断流显示虚线）
 * 严格遵守 `idle rAF === 0`，仅在 ResizeObserver / scroll / `pulseKey` 变化时工作。
 */
export function FluidConduitOverlay({
  containerRef,
  links,
  pulseKey,
  minContainerWidth = 640,
  flow = 'auto',
  className,
}: FluidConduitOverlayProps) {
  const { themeWorld } = useSettings()
  const motionAllowed = useMotionPreference()
  const [measured, setMeasured] = useState<MeasuredConduit[]>([])
  const linksSignature = JSON.stringify(links)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let frame = 0
    const measure = () => {
      frame = 0
      const cRect = container.getBoundingClientRect()
      if (cRect.width < minContainerWidth) {
        setMeasured((prev) => (prev.length === 0 ? prev : []))
        return
      }

      const next: MeasuredConduit[] = []
      const parsed = JSON.parse(linksSignature) as ConduitLink[]

      for (const link of parsed) {
        const fromEl = container.querySelector<HTMLElement>(
          `[data-conduit-anchor="${CSS.escape(link.from)}"]`,
        )
        const toEl = container.querySelector<HTMLElement>(
          `[data-conduit-anchor="${CSS.escape(link.to)}"]`,
        )
        if (!fromEl || !toEl) continue

        const fRect = fromEl.getBoundingClientRect()
        const tRect = toEl.getBoundingClientRect()
        if (fRect.width === 0 || tRect.width === 0) continue
        if (
          !isAnchorVisibleInScrollAncestors(fromEl, container) ||
          !isAnchorVisibleInScrollAncestors(toEl, container)
        ) {
          continue
        }

        const enabled = link.enabled !== false && link.scope !== 'BROKEN'
        const scope = link.scope ?? 'STANDARD'

        let x1: number
        let y1: number
        let x2: number
        let y2: number
        let cx1: number
        let cy1: number
        let cx2: number
        let cy2: number
        let gapScale: number

        if (flow !== 'vertical' && fRect.right <= tRect.left - 8) {
          x1 = fRect.right - cRect.left - 1
          y1 = fRect.top - cRect.top + fRect.height * 0.5 + (link.fromOffsetY ?? 0)
          x2 = tRect.left - cRect.left + 1
          y2 = tRect.top - cRect.top + tRect.height * 0.5 + (link.toOffsetY ?? 0)
          const gap = Math.max(0, x2 - x1)
          const dx = safeControlSpan(gap, 6, 0.45)
          cx1 = x1 + dx
          cy1 = y1
          cx2 = x2 - dx
          cy2 = y2
          gapScale = Math.min(1, Math.max(0.55, gap / 44))
        } else if (flow !== 'vertical' && tRect.right <= fRect.left - 8) {
          x1 = fRect.left - cRect.left + 1
          y1 = fRect.top - cRect.top + fRect.height * 0.5 + (link.fromOffsetY ?? 0)
          x2 = tRect.right - cRect.left - 1
          y2 = tRect.top - cRect.top + tRect.height * 0.5 + (link.toOffsetY ?? 0)
          const gap = Math.max(0, x1 - x2)
          const dx = safeControlSpan(gap, 6, 0.45)
          cx1 = x1 - dx
          cy1 = y1
          cx2 = x2 + dx
          cy2 = y2
          gapScale = Math.min(1, Math.max(0.55, gap / 44))
        } else {
          // 仅允许纵向阀门总线（flow='vertical' 或小直径阀门节点）绘制垂直短管，禁止在窄屏堆叠态垂直穿卡。
          const allowVerticalStem =
            flow === 'vertical' || (flow === 'auto' && Math.max(fRect.width, tRect.width) <= 72)
          if (!allowVerticalStem) continue

          const downward = tRect.top >= fRect.bottom - 2
          const upward = fRect.top >= tRect.bottom - 2
          if (!downward && !upward) continue

          x1 = fRect.left - cRect.left + fRect.width * 0.5
          x2 = tRect.left - cRect.left + tRect.width * 0.5
          if (downward) {
            y1 = fRect.bottom - cRect.top - 1 + (link.fromOffsetY ?? 0)
            y2 = tRect.top - cRect.top + 1 + (link.toOffsetY ?? 0)
          } else {
            y1 = fRect.top - cRect.top + 1 + (link.fromOffsetY ?? 0)
            y2 = tRect.bottom - cRect.top - 1 + (link.toOffsetY ?? 0)
          }
          const gapY = Math.abs(y2 - y1)
          if (gapY < 4) continue
          const dy = safeControlSpan(gapY, 2, 0.45)
          cx1 = x1
          cy1 = y1 + (y2 >= y1 ? dy : -dy)
          cx2 = x2
          cy2 = y2 - (y2 >= y1 ? dy : -dy)
          gapScale = Math.min(1, Math.max(0.38, gapY / 28))
        }

        const centerD = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`
        const halfWidth = (scope === 'ALL' ? 6.8 : 4.0) * gapScale
        const twin = buildTwinBankRiver(x1, y1, cx1, cy1, cx2, cy2, x2, y2, halfWidth)

        next.push({
          id: link.id,
          enabled,
          scope,
          gapScale,
          centerD,
          riverPoly: twin.riverPoly,
          topBank: twin.topBank,
          bottomBank: twin.bottomBank,
        })
      }

      setMeasured((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (item, idx) =>
              item.id === next[idx].id &&
              item.centerD === next[idx].centerD &&
              item.gapScale === next[idx].gapScale &&
              item.enabled === next[idx].enabled &&
              item.scope === next[idx].scope,
          )
        ) {
          return prev
        }
        return next
      })
    }

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(measure)
    }

    schedule()

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    observer?.observe(container)
    for (const anchor of container.querySelectorAll('[data-conduit-anchor]')) {
      observer?.observe(anchor)
    }

    container.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule, { passive: true })

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer?.disconnect()
      container.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [containerRef, flow, linksSignature, minContainerWidth])

  return (
    <svg
      aria-hidden="true"
      data-slot="fluid-conduit-overlay"
      data-world={themeWorld}
      style={{ position: 'absolute', inset: 0 }}
      className={cn(
        'pointer-events-none absolute inset-0 z-[1] size-full overflow-visible',
        className,
      )}
    >
      {measured.map((item) => {
        const isWide = item.scope === 'ALL'
        const widthScale = (isWide ? 1.25 : 0.9) * item.gapScale

        if (themeWorld === 'sketchbook') {
          if (!item.enabled) {
            return (
              <path
                key={item.id}
                d={item.centerD}
                fill="none"
                stroke="var(--conduit-muted)"
                strokeWidth={1.6}
                strokeDasharray="4 5"
                strokeLinecap="round"
              />
            )
          }
          return (
            <g key={item.id}>
              <path
                d={item.riverPoly}
                fill={isWide ? 'url(#apo-river-wide-grad)' : 'url(#apo-river-grad)'}
                filter="url(#watercolor-bleed)"
              />
              <path
                d={item.topBank}
                fill="none"
                stroke="var(--sketch-ink)"
                strokeWidth={1.25}
                strokeLinecap="round"
                opacity={0.72}
              />
              <path
                d={item.bottomBank}
                fill="none"
                stroke="var(--sketch-ink)"
                strokeWidth={1.25}
                strokeLinecap="round"
                opacity={0.72}
              />
              <path
                d={item.centerD}
                fill="none"
                stroke={isWide ? 'var(--conduit-wide)' : 'var(--conduit-core)'}
                strokeWidth={1.45}
                strokeDasharray="7 11"
                strokeLinecap="round"
                className={motionAllowed ? 'river-ripples' : undefined}
                opacity={0.72}
              />
            </g>
          )
        }

        if (themeWorld === 'obsidian') {
          if (!item.enabled) {
            return (
              <path
                key={item.id}
                d={item.centerD}
                fill="none"
                stroke="var(--conduit-muted)"
                strokeWidth={1.8}
                strokeDasharray="5 5"
                strokeLinecap="round"
              />
            )
          }
          return (
            <g key={item.id}>
              <path
                d={item.centerD}
                fill="none"
                stroke="var(--conduit-shadow)"
                strokeWidth={(isWide ? 14 : 10) * item.gapScale}
                strokeLinecap="round"
              />
              <path
                d={item.centerD}
                fill="none"
                stroke={isWide ? 'var(--conduit-wide)' : 'var(--conduit-core)'}
                strokeWidth={(isWide ? 3.8 : 2.3) * item.gapScale}
                strokeLinecap="round"
              />
              {motionAllowed && pulseKey !== undefined && (
                <motion.path
                  key={`${item.id}-${String(pulseKey)}`}
                  d={item.centerD}
                  fill="none"
                  stroke="var(--conduit-highlight)"
                  strokeWidth={(isWide ? 4 : 2.8) * item.gapScale}
                  strokeLinecap="round"
                  initial={{ pathLength: 0.16, pathOffset: 0, opacity: 0.92 }}
                  animate={{ pathOffset: 0.84, opacity: 0 }}
                  transition={unifiedMotion.causal.pathPulse}
                />
              )}
            </g>
          )
        }

        // fluid (default): 4-Layer Co-Axial Specular Glass Tube
        if (!item.enabled) {
          return (
            <g key={item.id}>
              <path
                d={item.centerD}
                fill="none"
                stroke="var(--conduit-muted)"
                strokeWidth={8.5 * item.gapScale}
                strokeLinecap="round"
              />
              <path
                d={item.centerD}
                transform={`translate(0, ${(-2 * item.gapScale).toFixed(1)})`}
                fill="none"
                stroke="var(--conduit-highlight)"
                strokeWidth={Math.max(1.1, 1.5 * item.gapScale)}
                strokeLinecap="round"
                opacity={0.65}
              />
            </g>
          )
        }

        return (
          <g key={item.id}>
            <path
              d={item.centerD}
              fill="none"
              stroke="var(--conduit-shadow)"
              strokeWidth={18 * widthScale}
              strokeLinecap="round"
            />
            <path
              d={item.centerD}
              fill="none"
              stroke="var(--conduit-rim)"
              strokeWidth={13 * widthScale}
              strokeLinecap="round"
              opacity={0.72}
            />
            <path
              d={item.centerD}
              fill="none"
              stroke="url(#apo-glass-pipe-grad)"
              strokeWidth={11.5 * widthScale}
              strokeLinecap="round"
            />
            <path
              d={item.centerD}
              fill="none"
              stroke={isWide ? 'var(--conduit-wide)' : 'var(--conduit-core)'}
              strokeWidth={4.2 * widthScale}
              strokeLinecap="round"
            />
            <path
              d={item.centerD}
              transform={`translate(0, ${(-3 * widthScale).toFixed(1)})`}
              fill="none"
              stroke="var(--conduit-highlight)"
              strokeWidth={Math.max(1.2, 2.1 * item.gapScale)}
              strokeLinecap="round"
            />
            {motionAllowed && pulseKey !== undefined && (
              <motion.path
                key={`${item.id}-${String(pulseKey)}`}
                d={item.centerD}
                fill="none"
                stroke="var(--conduit-highlight)"
                strokeWidth={4.5 * widthScale}
                strokeLinecap="round"
                initial={{ pathLength: 0.15, pathOffset: 0, opacity: 0.95 }}
                animate={{ pathOffset: 0.85, opacity: 0 }}
                transition={unifiedMotion.causal.pathPulse}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
