/**
 * PixelOrb 信号视窗渲染（spec §2.2 / §9.3 / §9.4）。
 *
 * v2.8 品牌修订：移除两颗圆眼、圆瞳孔与圆形高光，改为嵌入球体表面的单体
 * 横向观测窗。深色倒角窗体内由矩形信号段表达 gaze 与状态；视觉更像精密终端，
 * 不再落入通用萌系机器人范式。眨眼 = 信号段纵向收束，完整开合仍 ≤3 帧。
 */

import { ORB_CX, ORB_CY, ORB_RADIUS, rasterizeBody, setPx } from './draw'
import type { OrbRaster } from './draw'
import type { OrbTier } from './size'
import type { OrbPaletteKey, OrbState } from './types'

export interface EyeGeometry {
  eyeY: number
  leftX: number
  rightX: number
  eyeR: number
  visorX: number
  visorY: number
  visorW: number
  visorH: number
}

/**
 * 保留 eyeY/leftX/rightX/eyeR 字段以维持 gaze 与测试接口；实际外观由一体式
 * visor 几何定义。icon 档使用更短、更矮的信号窗，避免缩小时糊成双圆点。
 */
export function eyeGeometry(tier: OrbTier): EyeGeometry {
  const eyeY = ORB_CY - ORB_RADIUS * 0.22
  const eyeR = ORB_RADIUS * (tier === 'icon' ? 0.1 : 0.12)
  const spacing = ORB_RADIUS * 0.35
  const visorW = tier === 'icon' ? 34 : tier === 'simple' ? 44 : 50
  const visorH = tier === 'icon' ? 10 : tier === 'simple' ? 14 : 18
  return {
    eyeY,
    leftX: ORB_CX - spacing / 2,
    rightX: ORB_CX + spacing / 2,
    eyeR,
    visorX: ORB_CX - visorW / 2,
    visorY: eyeY - visorH / 2,
    visorW,
    visorH,
  }
}

/** 眨眼时序：半闭 → 全闭 → 半闭，第 4 帧恢复。 */
export const BLINK_FRAMES = 3

export function blinkLid(elapsedSec: number): number {
  const frame = Math.floor(elapsedSec * 60)
  if (frame < 0 || frame >= BLINK_FRAMES) return 0
  return frame === 1 ? 1 : 0.5
}

export interface DrawEyesOpts {
  state: OrbState
  tier: OrbTier
  time?: number
  /** gaze 偏移沿用旧字段名；现在驱动窗内信号段，而非瞳孔。 */
  pupilX?: number
  pupilY?: number
  hiX?: number
  hiY?: number
  lid?: number
}

export function drawEyes(buf: OrbRaster, opts: DrawEyesOpts): void {
  const geo = eyeGeometry(opts.tier)
  switch (opts.state) {
    case 'waiting':
      drawWaitingSignal(buf, geo, opts.time ?? 0, opts.tier)
      return
    case 'success':
      drawSuccessSignal(buf, geo, opts.tier)
      return
    case 'error':
      drawErrorSignal(buf, geo, opts.tier)
      return
    case 'sleeping':
      drawSleepingSignal(buf, geo)
      return
    default:
      drawIdleSignal(buf, geo, opts)
  }
}

export interface ComposeOrbOpts extends DrawEyesOpts {
  body?: OrbRaster
}

export function composeOrb(opts: ComposeOrbOpts): OrbRaster {
  const buf = opts.body ? opts.body.slice() : rasterizeBody()
  drawEyes(buf, opts)
  return buf
}

/** 像素矩形，几何最终仍经 setPx 整格化。 */
function fillRect(
  buf: OrbRaster,
  x: number,
  y: number,
  width: number,
  height: number,
  key: OrbPaletteKey,
): void {
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) setPx(buf, x0 + px, y0 + py, key)
  }
}

/** 锐利倒角矩形：不用圆角，顶/底两行内收形成精密开孔。 */
function fillChamferedRect(
  buf: OrbRaster,
  x: number,
  y: number,
  width: number,
  height: number,
  cut: number,
  key: OrbPaletteKey,
): void {
  const h = Math.max(1, Math.round(height))
  for (let row = 0; row < h; row++) {
    const edge = Math.min(row, h - 1 - row)
    const inset = Math.max(0, Math.round(cut) - edge)
    fillRect(buf, x + inset, y + row, width - inset * 2, 1, key)
  }
}

function drawVisor(buf: OrbRaster, geo: EyeGeometry): void {
  fillChamferedRect(buf, geo.visorX, geo.visorY, geo.visorW, geo.visorH, 3, 'outline')
  // 内层横向轨道给窗体一条精细层次，不引入新的颜色字面量。
  fillRect(buf, geo.visorX + 6, geo.eyeY - 1, geo.visorW - 12, 2, 'shadow')
}

// ---------- idle：双矩形信号段随 gaze 在窗内整体偏移 ----------

function drawIdleSignal(buf: OrbRaster, geo: EyeGeometry, opts: DrawEyesOpts): void {
  drawVisor(buf, geo)
  const lid = Math.min(1, Math.max(0, opts.lid ?? 0))
  if (lid >= 0.5) return

  const icon = opts.tier === 'icon'
  const signalW = icon ? 8 : 7
  const signalH = icon ? 2 : 4
  const maxX = icon ? 3 : 5
  const maxY = icon ? 1 : 2
  const offsetX = Math.max(-maxX, Math.min(maxX, Math.round((opts.pupilX ?? 0) * 0.65)))
  const offsetY = Math.max(-maxY, Math.min(maxY, Math.round((opts.pupilY ?? 0) * 0.45)))

  if (icon) {
    fillRect(buf, ORB_CX - signalW / 2 + offsetX, geo.eyeY - 1 + offsetY, signalW, signalH, 'eyeHi')
    return
  }

  for (const centerX of [geo.leftX, geo.rightX]) {
    fillRect(
      buf,
      centerX - signalW / 2 + offsetX,
      geo.eyeY - signalH / 2 + offsetY,
      signalW,
      signalH,
      'eyeHi',
    )
  }
}

// ---------- waiting：扫描序列，不再用眼内圆周运动 ----------

function drawWaitingSignal(buf: OrbRaster, geo: EyeGeometry, time: number, tier: OrbTier): void {
  drawVisor(buf, geo)
  const count = tier === 'icon' ? 3 : 5
  const segment = tier === 'icon' ? 4 : 5
  const gap = tier === 'icon' ? 2 : 3
  const total = count * segment + (count - 1) * gap
  const active = Math.floor(time * 8) % count
  const y = geo.eyeY - (tier === 'icon' ? 1 : 2)
  for (let i = 0; i < count; i++) {
    fillRect(
      buf,
      ORB_CX - total / 2 + i * (segment + gap),
      y,
      segment,
      tier === 'icon' ? 2 : 4,
      i === active ? 'eyeHi' : 'shadow',
    )
  }
}

// ---------- success：窗内上扬折线，表达确认而非笑脸 ----------

function drawSuccessSignal(buf: OrbRaster, geo: EyeGeometry, tier: OrbTier): void {
  drawVisor(buf, geo)
  const half = tier === 'icon' ? 5 : 8
  const thickness = tier === 'full' || tier === 'clear' ? 2 : 1
  for (let x = -half; x <= half; x++) {
    const y = x < 0 ? Math.round(-x * 0.35) : Math.round(-x * 0.55)
    for (let t = 0; t < thickness; t++) setPx(buf, ORB_CX + x, geo.eyeY + y + t, 'eyeHi')
  }
}

// ---------- error：断裂 X 信号 ----------

function drawErrorSignal(buf: OrbRaster, geo: EyeGeometry, tier: OrbTier): void {
  drawVisor(buf, geo)
  const half = tier === 'icon' ? 4 : 7
  const thick = tier === 'full' || tier === 'clear' ? 1 : 0
  for (let i = -half; i <= half; i++) {
    if (Math.abs(i) <= 1) continue // 中央断点，避免通用表情符号感
    for (let t = 0; t <= thick; t++) {
      setPx(buf, ORB_CX + i, geo.eyeY + i + t, 'eye')
      setPx(buf, ORB_CX + i, geo.eyeY - i + t, 'eye')
    }
  }
}

// ---------- sleeping：观测窗关闭为单条静默信号 ----------

function drawSleepingSignal(buf: OrbRaster, geo: EyeGeometry): void {
  const lineW = Math.round(geo.visorW * 0.62)
  fillRect(buf, ORB_CX - lineW / 2, geo.eyeY, lineW, 2, 'outline')
}
