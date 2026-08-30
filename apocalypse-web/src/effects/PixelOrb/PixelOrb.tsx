/**
 * PixelOrb —— 直接使用批准设计稿的 Mint Bonk 状态精灵。
 *
 * 透明 PNG 保留设计稿中的完整造型与表情；组件只负责按状态裁切 3×2 母版和播放
 * 整像素位移。idle 视线通过移动原稿眼部高光裁片实现，不用 Canvas 或代码栅格
 * 重新解释角色。
 */

import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

import { orbUnit } from './size'
import {
  MINT_BONK_SHEET_COLUMNS,
  MINT_BONK_SHEET_ROWS,
  MINT_BONK_SOURCE_CELL_SIZE,
  MINT_BONK_SPRITE_SHEET,
  ORB_STATE_CELLS,
} from './sprites'
import type { PixelOrbProps } from './types'

const IDLE_EYE_GLINTS = [
  {
    id: 'left',
    target: { x: 229, y: 280, width: 10, height: 16 },
    coverSource: { x: 236, y: 296 },
  },
  {
    id: 'right',
    target: { x: 341, y: 280, width: 10, height: 16 },
    coverSource: { x: 348, y: 296 },
  },
] as const

function SpriteCrop({
  size,
  sourceX,
  sourceY,
  targetX,
  targetY,
  width,
  height,
  moving = false,
}: {
  size: number
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  width: number
  height: number
  moving?: boolean
}) {
  const scale = size / MINT_BONK_SOURCE_CELL_SIZE

  return (
    <span
      aria-hidden
      data-slot={moving ? 'mint-bonk-gaze-glint' : 'mint-bonk-gaze-cover'}
      className="pointer-events-none absolute block overflow-hidden"
      style={{
        left: targetX * scale,
        top: targetY * scale,
        width: width * scale,
        height: height * scale,
      }}
    >
      <img
        src={MINT_BONK_SPRITE_SHEET}
        alt=""
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{
          width: size * MINT_BONK_SHEET_COLUMNS,
          height: size * MINT_BONK_SHEET_ROWS,
          left: -sourceX * scale,
          top: -sourceY * scale,
          imageRendering: 'pixelated',
        }}
      />
    </span>
  )
}

function IdleGazeEyes({ size }: { size: number }) {
  return (
    <span aria-hidden data-slot="mint-bonk-gaze" className="pointer-events-none absolute inset-0">
      {IDLE_EYE_GLINTS.flatMap(({ id, target, coverSource }) => [
        <SpriteCrop
          key={`${id}-cover`}
          size={size}
          sourceX={coverSource.x}
          sourceY={coverSource.y}
          targetX={target.x}
          targetY={target.y}
          width={target.width}
          height={target.height}
        />,
        <SpriteCrop
          key={`${id}-glint`}
          size={size}
          sourceX={target.x}
          sourceY={target.y}
          targetX={target.x}
          targetY={target.y}
          width={target.width}
          height={target.height}
          moving
        />,
      ])}
    </span>
  )
}

export function PixelOrb({
  state = 'idle',
  skin,
  size = 64,
  gaze = false,
  className,
}: PixelOrbProps) {
  const { motionEnabled } = useSettings()
  const reducedMotion = useReducedMotion()
  const animated = motionEnabled && reducedMotion !== true
  const cell = ORB_STATE_CELLS[state]
  const rootRef = useRef<HTMLDivElement>(null)

  // 执行合法尺寸校验；显示尺寸使用批准的 256/128/64/32 阶梯。
  orbUnit(size)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let lastX = 0
    let lastY = 0
    const setOffset = (x: number, y: number) => {
      if (x === lastX && y === lastY) return
      lastX = x
      lastY = y
      root.style.setProperty('--mint-bonk-gaze-x', `${x}px`)
      root.style.setProperty('--mint-bonk-gaze-y', `${y}px`)
    }
    const reset = () => setOffset(0, 0)

    reset()
    if (!gaze || state !== 'idle' || !animated) return

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect()
      const dx = event.clientX - (bounds.left + bounds.width / 2)
      const dy = event.clientY - (bounds.top + bounds.height / 2)
      const distance = Math.hypot(dx, dy)
      if (distance < 1) {
        reset()
        return
      }

      const maxOffset = Math.max(1, Math.round(size / 64))
      const strength = Math.min(1, distance / Math.max(size * 0.75, 1))
      setOffset(
        Math.round((dx / distance) * maxOffset * strength),
        Math.round((dy / distance) * maxOffset * strength),
      )
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('blur', reset)
      reset()
    }
  }, [animated, gaze, size, state])

  return (
    <div
      ref={rootRef}
      className={cn('relative shrink-0 overflow-visible', className)}
      style={{ width: size, height: size }}
      aria-hidden
      data-state={state}
      data-skin={skin ?? 'approved-mint'}
      data-gaze={gaze ? 'enabled' : 'disabled'}
      data-motion={animated ? 'on' : 'off'}
      data-mascot="mint-bonk"
    >
      <div
        data-slot="mint-bonk-frame"
        className="absolute inset-0 overflow-hidden"
        style={{ width: size, height: size }}
      >
        <img
          src={MINT_BONK_SPRITE_SHEET}
          alt=""
          draggable={false}
          data-slot="mint-bonk-sprite-sheet"
          className="pointer-events-none absolute max-w-none select-none"
          style={{
            width: size * MINT_BONK_SHEET_COLUMNS,
            height: size * MINT_BONK_SHEET_ROWS,
            left: -cell.column * size,
            top: -cell.row * size,
            imageRendering: 'pixelated',
          }}
        />
        {state === 'idle' && gaze && <IdleGazeEyes size={size} />}
      </div>
    </div>
  )
}
