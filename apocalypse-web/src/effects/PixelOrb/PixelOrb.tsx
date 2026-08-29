/**
 * PixelOrb —— Apocalypse 的高密度像素蝾螈品牌形象。
 *
 * 视觉母版来自 public/brand/packet-axolotl-*.png；组件只在空眼母版上绘制
 * 两枚像素瞳孔，因此鼠标跟随时身体、鳃、爪与尾巴完全不重绘、不跳帧。
 * 256/128/64/32 四档均使用 2× 内部画布，先把 1254px 母版按 nearest-neighbor
 * 缓存到离屏 canvas，再逐帧只提交一个小画布与两枚瞳孔。
 *
 * 双开关（prefers-reduced-motion / 设置「动画」）命中时直接显示居中视线母版，
 * 不挂 pointer 监听、不启 rAF。运行期持续低帧时同样降级到静态母版。
 */

import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef } from 'react'

import { cn } from '@/lib/utils'
import { useSettings, useSettingsStore } from '@/stores/settings'

import { createFpsSampler } from '../perf'
import { ORB_RADIUS, resolvePalette } from './draw'
import type { ResolvedPalette, Rgb } from './draw'
import { blinkLid } from './eyes'
import { computeGaze, springStep, zeroSpring } from './gaze'
import type { GazeOffset, GazeSpring } from './gaze'
import { orbUnit } from './size'
import { ORB_SKINS } from './skins'
import type { OrbState, PixelOrbProps } from './types'

const BASE_ASSET = '/brand/packet-axolotl-base.png'
const MASTER_ASSET = '/brand/packet-axolotl-master.png'
const BLINK_ASSET = '/brand/packet-axolotl-blink.png'

/** 图生母版的眼球中心（相对 1254×1254 画布归一化）。 */
const EYE_CENTERS = [
  { x: 0.367, y: 0.557 },
  { x: 0.605, y: 0.557 },
] as const

const ZERO_GAZE: GazeOffset = {
  x: 0,
  y: 0,
  pupilX: 0,
  pupilY: 0,
  hiX: 0,
  hiY: 0,
  tiltDeg: 0,
}

interface GazeChannels {
  pupilX: GazeSpring
  pupilY: GazeSpring
  hiX: GazeSpring
  hiY: GazeSpring
  tilt: GazeSpring
}

interface PreparedFrames {
  base: HTMLCanvasElement
  master: HTMLCanvasElement
  blink: HTMLCanvasElement
}

const assetPromises = new Map<string, Promise<HTMLImageElement>>()

function loadAsset(src: string): Promise<HTMLImageElement> {
  const cached = assetPromises.get(src)
  if (cached) return cached

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`无法载入吉祥物资产：${src}`))
    image.src = src
  })
  assetPromises.set(src, promise)
  return promise
}

function zeroChannels(): GazeChannels {
  return {
    pupilX: zeroSpring(),
    pupilY: zeroSpring(),
    hiX: zeroSpring(),
    hiY: zeroSpring(),
    tilt: zeroSpring(),
  }
}

function internalSize(cssSize: number): number {
  return cssSize * 2
}

function prepareFrame(image: HTMLImageElement, size: number): HTMLCanvasElement {
  const frame = document.createElement('canvas')
  frame.width = size
  frame.height = size
  const ctx = frame.getContext('2d', { alpha: true })
  if (!ctx) return frame
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(image, 0, 0, size, size)
  return frame
}

function rgb([r, g, b]: Rgb): string {
  return `rgb(${r} ${g} ${b})`
}

/** 用整格 fillRect 画椭圆，避免 canvas path 的抗锯齿软边。 */
function fillPixelEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  cell: number,
  color: string,
): void {
  const cols = Math.ceil(rx / cell)
  const rows = Math.ceil(ry / cell)
  ctx.fillStyle = color
  for (let gy = -rows; gy <= rows; gy++) {
    for (let gx = -cols; gx <= cols; gx++) {
      const px = ((gx + 0.5) * cell) / rx
      const py = ((gy + 0.5) * cell) / ry
      if (px * px + py * py > 1) continue
      ctx.fillRect(Math.round(cx + gx * cell), Math.round(cy + gy * cell), cell, cell)
    }
  }
}

function drawPupils(
  ctx: CanvasRenderingContext2D,
  size: number,
  palette: ResolvedPalette,
  pupilX: number,
  pupilY: number,
  hiX: number,
  hiY: number,
): void {
  const gridScale = size / 128
  // 256px 主视觉保持约 1 CSS px 的逻辑像素，避免瞳孔比图生母版更粗。
  const cell = Math.max(1, Math.round(size / 256))
  const dx = pupilX * gridScale
  const dy = pupilY * gridScale
  const highlightDx = hiX * gridScale
  const highlightDy = hiY * gridScale

  for (const center of EYE_CENTERS) {
    const cx = center.x * size + dx
    const cy = center.y * size + dy

    fillPixelEllipse(ctx, cx, cy, size * 0.036, size * 0.041, cell, rgb(palette.eye))
    fillPixelEllipse(ctx, cx, cy + cell, size * 0.029, size * 0.034, cell, rgb(palette.outline))
    fillPixelEllipse(ctx, cx, cy + cell * 2, size * 0.019, size * 0.025, cell, rgb(palette.eye))

    const highlight = cell * 4
    ctx.fillStyle = rgb(palette.eyeHi)
    ctx.fillRect(
      Math.round(cx - size * 0.015 + highlightDx),
      Math.round(cy - size * 0.019 + highlightDy),
      highlight,
      highlight,
    )
  }
}

function stateGaze(state: OrbState, time: number, current: GazeOffset): GazeOffset {
  if (state === 'waiting') {
    return {
      ...ZERO_GAZE,
      pupilX: Math.sin(time * 5.5) * 3.2,
      pupilY: Math.cos(time * 3.2) * 1.4,
      hiX: Math.sin(time * 5.5) * 1.4,
      hiY: Math.cos(time * 3.2) * 0.6,
    }
  }
  if (state === 'success') return { ...ZERO_GAZE, pupilY: -1.6, hiY: -0.8 }
  if (state === 'error') return { ...ZERO_GAZE, pupilY: 1.4, hiY: 0.6 }
  return current
}

export function PixelOrb({
  state = 'idle',
  skin,
  size = 64,
  gaze = false,
  className,
}: PixelOrbProps) {
  const { motionEnabled } = useSettings()
  const globalSkin = useSettingsStore((s) => s.mascotSkin)
  const reducedMotion = useReducedMotion()
  const staticMode = !motionEnabled || reducedMotion === true

  const cssSize = 128 * orbUnit(size)
  const renderSize = internalSize(cssSize)
  const palette = useMemo(
    () => resolvePalette(ORB_SKINS[skin ?? globalSkin].palette),
    [skin, globalSkin],
  )

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const gazeTargetRef = useRef<GazeOffset>(ZERO_GAZE)
  const gazeActiveRef = useRef(false)
  const gazeRef = useRef<GazeChannels>(zeroChannels())
  const prevStateRef = useRef(state)
  const stateEntryRef = useRef(0)
  const blinkT0Ref = useRef(-1)
  const nextBlinkRef = useRef(0)

  useEffect(() => {
    if (!gaze || staticMode) return
    const onMove = (event: PointerEvent) => {
      const el = wrapRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      gazeTargetRef.current = computeGaze(
        event.clientX - (rect.left + rect.width / 2),
        event.clientY - (rect.top + rect.height / 2),
        ORB_RADIUS * 2,
      )
      gazeActiveRef.current = true
    }
    const onLeave = () => {
      gazeActiveRef.current = false
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [gaze, staticMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    let cancelled = false
    let raf = 0
    let lastNow = 0
    let frames: PreparedFrames | null = null
    let degraded = false
    const t0 = performance.now()
    const frozen = () => staticMode || degraded

    const paint = (nowMs: number) => {
      if (!frames) return
      const timeSec = frozen() ? 0 : (nowMs - t0) / 1000
      const dt = lastNow > 0 ? (nowMs - lastNow) / 1000 : 1 / 60
      lastNow = nowMs

      if (prevStateRef.current !== state) {
        prevStateRef.current = state
        stateEntryRef.current = timeSec
      }

      let currentGaze = ZERO_GAZE
      if (gaze && !frozen() && state === 'idle') {
        const target = gazeTargetRef.current
        const channels = gazeRef.current
        if (gazeActiveRef.current) {
          channels.pupilX = { value: target.pupilX, velocity: 0 }
          channels.pupilY = { value: target.pupilY, velocity: 0 }
          channels.hiX = { value: target.hiX, velocity: 0 }
          channels.hiY = { value: target.hiY, velocity: 0 }
          channels.tilt = { value: target.tiltDeg, velocity: 0 }
        } else {
          channels.pupilX = springStep(channels.pupilX, 0, dt)
          channels.pupilY = springStep(channels.pupilY, 0, dt)
          channels.hiX = springStep(channels.hiX, 0, dt)
          channels.hiY = springStep(channels.hiY, 0, dt)
          channels.tilt = springStep(channels.tilt, 0, dt)
        }
        currentGaze = {
          ...ZERO_GAZE,
          pupilX: channels.pupilX.value,
          pupilY: channels.pupilY.value,
          hiX: channels.hiX.value,
          hiY: channels.hiY.value,
          tiltDeg: channels.tilt.value,
        }
      }

      let lid = 0
      if (!frozen() && state === 'idle') {
        if (nextBlinkRef.current <= 0) nextBlinkRef.current = timeSec + 2.8 + Math.random() * 3.2
        if (timeSec >= nextBlinkRef.current) {
          blinkT0Ref.current = timeSec
          nextBlinkRef.current = timeSec + 2.8 + Math.random() * 3.2
        }
        lid = blinkT0Ref.current >= 0 ? blinkLid(timeSec - blinkT0Ref.current) : 0
      }

      ctx.clearRect(0, 0, renderSize, renderSize)
      if (state === 'sleeping' || lid > 0) {
        ctx.drawImage(frames.blink, 0, 0)
      } else if (frozen()) {
        ctx.drawImage(frames.master, 0, 0)
      } else {
        ctx.drawImage(frames.base, 0, 0)
        const expression = stateGaze(state, timeSec, currentGaze)
        drawPupils(
          ctx,
          renderSize,
          palette,
          expression.pupilX,
          expression.pupilY,
          expression.hiX,
          expression.hiY,
        )
      }

      let tx = 0
      let ty = 0
      if (!frozen()) {
        if (state === 'idle') ty = Math.round(Math.sin(timeSec * 1.4))
        if (state === 'success') {
          const elapsed = timeSec - stateEntryRef.current
          if (elapsed < 0.55) ty = -Math.round(8 * Math.sin((Math.PI * elapsed) / 0.55))
        }
        if (state === 'error') tx = Math.round(Math.sin(timeSec * 22) * 1.5)
        if (state === 'sleeping') ty = 2 + Math.round(Math.sin(timeSec * 0.9))
      } else if (state === 'sleeping') {
        ty = 2
      }
      const tilt = state === 'idle' ? gazeRef.current.tilt.value * 0.35 : 0
      canvas.style.transform = `translate(${tx}px, ${ty}px) rotate(${tilt}deg)`
    }

    void Promise.all([loadAsset(BASE_ASSET), loadAsset(MASTER_ASSET), loadAsset(BLINK_ASSET)])
      .then(([base, master, blink]) => {
        if (cancelled) return
        frames = {
          base: prepareFrame(base, renderSize),
          master: prepareFrame(master, renderSize),
          blink: prepareFrame(blink, renderSize),
        }
        paint(performance.now())
        if (staticMode) return

        const fps = createFpsSampler()
        const loop = (now: number) => {
          if (fps.tick(now)) {
            degraded = true
            paint(now)
            console.info(
              `[PixelOrb] 持续低帧（约 ${Math.round(fps.fps ?? 0)}fps < 30fps 达 2s），已降级为静态品牌母版`,
            )
            return
          }
          paint(now)
          raf = window.requestAnimationFrame(loop)
        }
        raf = window.requestAnimationFrame(loop)
      })
      .catch((error: unknown) => {
        console.error(error)
      })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
    }
  }, [state, palette, gaze, staticMode, renderSize])

  return (
    <div
      ref={wrapRef}
      className={cn('relative shrink-0', className)}
      style={{ width: cssSize, height: cssSize }}
      aria-hidden
      data-state={state}
      data-mascot="packet-axolotl"
    >
      <canvas
        ref={canvasRef}
        width={renderSize}
        height={renderSize}
        className="absolute left-0 top-0"
        style={{ width: cssSize, height: cssSize, imageRendering: 'pixelated' }}
      />
    </div>
  )
}
