import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

import { buildSketchPaths } from './procedural-geometry'

export interface SketchBoxProps {
  seed?: number
  wash?: 'none' | 'normal' | 'wide'
  washiTape?: boolean
  className?: string
  contentClassName?: string
  'data-conduit-anchor'?: string
  children: ReactNode
}

/**
 * 正交三主题自适应容器（`<SketchBox />`）：
 * 在 `sketchbook` 世界下动态渲染双墨线出锋描边与文字绝缘 `.wash-layer` 水彩底色；
 * 在 `fluid` 与 `obsidian` 世界下零 SVG 额外渲染开销。
 */
export function SketchBox({
  seed = 19,
  wash = 'none',
  washiTape = false,
  className,
  contentClassName,
  'data-conduit-anchor': conduitAnchor,
  children,
}: SketchBoxProps) {
  const { themeWorld } = useSettings()
  const isSketchbook = themeWorld === 'sketchbook'
  const hostRef = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!isSketchbook) return
    const element = hostRef.current
    if (!element) return

    const sync = () => {
      const nextW = element.offsetWidth
      const nextH = element.offsetHeight
      setBounds((prev) =>
        prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH },
      )
    }

    const frame = window.requestAnimationFrame(sync)
    if (typeof ResizeObserver === 'undefined') {
      return () => window.cancelAnimationFrame(frame)
    }
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [isSketchbook])

  const paths = useMemo(
    () => (isSketchbook ? buildSketchPaths(bounds.width, bounds.height, seed) : null),
    [bounds.height, bounds.width, isSketchbook, seed],
  )

  return (
    <div
      ref={hostRef}
      data-slot="sketch-box"
      data-conduit-anchor={conduitAnchor}
      className={cn(
        'sketch-surface rounded-panel border border-border-subtle bg-card text-card-foreground shadow-surface',
        className,
      )}
    >
      {wash !== 'none' && <div className="wash-layer" data-wash={wash} aria-hidden="true" />}

      {isSketchbook && washiTape && (
        <span
          aria-hidden="true"
          data-slot="sketch-washi-tape"
          className="pointer-events-none absolute -top-2 right-4 z-[5] h-3.5 w-11 rotate-[11deg] rounded-[2px] border border-sketch-ink/20 bg-[var(--sketch-washi)] shadow-xs"
        />
      )}

      {isSketchbook && paths && paths.primary && (
        <svg
          className="sketch-border-svg"
          viewBox={`0 0 ${bounds.width} ${bounds.height}`}
          aria-hidden="true"
        >
          <path
            d={paths.primary}
            fill="none"
            stroke="var(--sketch-ink)"
            strokeWidth={1.65}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.88}
          />
          <path
            d={paths.secondary}
            fill="none"
            stroke="var(--sketch-ink)"
            strokeWidth={1.05}
            strokeLinecap="round"
            opacity={0.44}
          />
        </svg>
      )}

      <div className={cn('crisp-content', contentClassName)}>{children}</div>
    </div>
  )
}
