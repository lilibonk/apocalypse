import { Maximize2, Minus, Plus } from 'lucide-react'
import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type WheelEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { clampZoom, fitOverview, fitView, panIntoView, type View } from './view'

export interface ZoomPanCanvasHandle {
  fit: () => void
  overview: () => void
  centerOn: (
    box: { x: number; y: number; width: number; height: number },
    minimumScale?: number,
  ) => void
}

/**
 * Pan/zoom viewport for graph content of a known natural size. Mouse: drag background to pan,
 * Ctrl/⌘ + wheel to zoom. Keyboard (canvas focused): arrows pan, + / - zoom, 0 fits.
 * Plain wheel keeps scrolling the page so the canvas never traps scrolling.
 */
export function ZoomPanCanvas({
  width,
  height,
  label,
  children,
  fitKey,
  minFitScale,
  reveal,
  ref,
  fitLabel,
}: {
  width: number
  height: number
  label: string
  children: ReactNode
  /** Changing this refits the content (e.g. a new tree or expanded branch). */
  fitKey?: string | number
  /** Lowest scale "fit" may use so labels stay readable. */
  minFitScale?: number
  /** Content-space box to keep visible (focused or selected item); panned into view when needed. */
  reveal?: { x: number; y: number; width: number; height: number } | null
  ref?: Ref<ZoomPanCanvasHandle>
  fitLabel?: string
}) {
  const { t } = useTranslation()
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; view: View } | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const [dragging, setDragging] = useState(false)

  const fit = useCallback(() => {
    const box = frame.current
    if (!box) return
    setView(fitView(box.clientWidth, box.clientHeight, width, height, 24, minFitScale))
  }, [width, height, minFitScale])

  useImperativeHandle(
    ref,
    () => ({
      fit,
      overview: () => {
        const box = frame.current
        if (box) setView(fitOverview(box.clientWidth, box.clientHeight, width, height))
      },
      centerOn: (target, minimumScale) => {
        const box = frame.current
        if (!box) return
        setView((current) => {
          const scale = Math.max(current.scale, minimumScale ?? current.scale)
          return {
            scale,
            x: box.clientWidth / 2 - (target.x + target.width / 2) * scale,
            y: box.clientHeight / 2 - (target.y + target.height / 2) * scale,
          }
        })
      },
    }),
    [fit, width, height],
  )

  useLayoutEffect(() => {
    fit()
  }, [fit, fitKey])

  const revealKey = reveal ? `${reveal.x}:${reveal.y}:${reveal.width}:${reveal.height}` : ''
  useLayoutEffect(() => {
    const box = frame.current
    if (!reveal || !box) return
    setView((current) => panIntoView(current, reveal, box.clientWidth, box.clientHeight))
    // revealKey captures the box; the object identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey])

  const zoomBy = (factor: number) =>
    setView((current) => {
      const box = frame.current
      const cx = (box?.clientWidth ?? 0) / 2
      const cy = (box?.clientHeight ?? 0) / 2
      const scale = clampZoom(current.scale * factor)
      const ratio = scale / current.scale
      return { scale, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio }
    })

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1)
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, input')) return
    drag.current = { x: event.clientX, y: event.clientY, view }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    setView({
      ...start.view,
      x: start.view.x + event.clientX - start.x,
      y: start.view.y + event.clientY - start.y,
    })
  }
  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const step = 48
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    if (moves[event.key]) {
      event.preventDefault()
      const [dx, dy] = moves[event.key]
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomBy(1.2)
    } else if (event.key === '-') {
      event.preventDefault()
      zoomBy(1 / 1.2)
    } else if (event.key === '0') {
      event.preventDefault()
      fit()
    }
  }

  return (
    <div className="graph-canvas">
      <div
        ref={frame}
        role="group"
        tabIndex={0}
        aria-label={label}
        aria-roledescription={t('graph.canvas')}
        className="graph-canvas-frame"
        data-dragging={dragging || undefined}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div
          className="graph-canvas-content"
          style={{
            width,
            height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {children}
        </div>
      </div>
      <div className="graph-canvas-controls">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('graph.zoomIn')}
          onClick={() => zoomBy(1.2)}
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('graph.zoomOut')}
          onClick={() => zoomBy(1 / 1.2)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={fitLabel ?? t('graph.fit')}
          title={fitLabel ?? t('graph.fit')}
          onClick={fit}
        >
          <Maximize2 aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
