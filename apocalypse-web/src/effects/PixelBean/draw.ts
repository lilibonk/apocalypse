/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 *
 * PixelBean 栅格：连续肾形 SDF → 每帧打成像素（Grok 式流畅的像素版）。
 *
 * 形状不是贴死的精灵。呼吸 / 倾斜 / 视线是浮点参数，栅格化时才贴到整数格，
 * 轮廓上的像素会生长、收回，看起来像在流动，而不是整图硬跳。
 *
 * 索引：0 透明 / 1 outline / 2 fill / 3 shade / 4 eye / 5 pupil /
 * 6 eyeHi / 7 core / 8 coreHi / 9 shadow。
 */

import { BEAN_NATIVE_WIDTH } from './size'

export const N = BEAN_NATIVE_WIDTH
const AREA = N * N

export const PX = {
  empty: 0,
  outline: 1,
  fill: 2,
  shade: 3,
  eye: 4,
  pupil: 5,
  eyeHi: 6,
  core: 7,
  coreHi: 8,
  shadow: 9,
} as const

export const PIXEL_KEYS: Record<number, string> = {
  [PX.outline]: 'outline',
  [PX.fill]: 'fill',
  [PX.shade]: 'shade',
  [PX.eye]: 'eye',
  [PX.pupil]: 'eye',
  [PX.eyeHi]: 'eyeHi',
  [PX.core]: 'core',
  [PX.coreHi]: 'coreHi',
  [PX.shadow]: 'shadow',
}

export type PoseId = 'idle' | 'blink' | 'success' | 'error' | 'sleeping' | 'flat' | 'mini'

function idx(x: number, y: number): number {
  return y * N + x
}

function inEllipse(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): boolean {
  const dx = (px - cx) / rx
  const dy = (py - cy) / ry
  return dx * dx + dy * dy <= 1
}

/** 效果图那种 lima：上叶偏左、下叶向右鼓。squash/tilt 在栅格前作用。 */
function insideLima(
  x: number,
  y: number,
  kind: 'body' | 'mini' | 'flat',
  squashY: number,
  tilt: number,
  time: number,
): boolean {
  const cx = N / 2
  const cy = N / 2 + (kind === 'flat' ? N * 0.12 : 0)
  const dx = x + 0.5 - cx
  const dy = (y + 0.5 - cy) / squashY
  const c = Math.cos(tilt - 0.36)
  const s = Math.sin(tilt - 0.36)
  const rx = dx * c - dy * s
  const ry = dx * s + dy * c
  const k = N / 64
  if (kind === 'flat') {
    return inEllipse(cx + rx, cy + ry, cx, cy + 4 * k, 24 * k, 8 * k)
  }
  const scale = kind === 'mini' ? 0.5 : 1
  const a = 20.5 * k * scale
  const b = 25.5 * k * scale
  const ny = ry / b
  const width = a * (1 + 0.32 * ny)
  const nx = (rx - 4.5 * k * scale * ny) / width
  const waist = 0.3 * Math.exp(-((nx + 0.62) ** 2) * 2.4 - (ny - 0.05) * (ny - 0.05) * 0.9)
  const ang = Math.atan2(ry, rx)
  const surface =
    1 +
    0.02 * Math.sin(time * 2.05) +
    0.018 * Math.sin(ang * 3 + time * 2.55) +
    0.01 * Math.sin(ang * 5 - time * 1.85)
  return nx * nx + ny * ny - waist < surface
}

function distField(mask: Uint8Array): Int16Array {
  const dist = new Int16Array(AREA)
  const q: number[] = []
  for (let i = 0; i < AREA; i++) {
    if (mask[i]) {
      dist[i] = 32767
    } else {
      dist[i] = 0
      q.push(i)
    }
  }
  let head = 0
  while (head < q.length) {
    const i = q[head++]
    const x = i % N
    const y = (i / N) | 0
    const nd = dist[i] + 1
    if (x > 0 && dist[i - 1] > nd) {
      dist[i - 1] = nd
      q.push(i - 1)
    }
    if (x < N - 1 && dist[i + 1] > nd) {
      dist[i + 1] = nd
      q.push(i + 1)
    }
    if (y > 0 && dist[i - N] > nd) {
      dist[i - N] = nd
      q.push(i - N)
    }
    if (y < N - 1 && dist[i + N] > nd) {
      dist[i + N] = nd
      q.push(i + N)
    }
  }
  return dist
}

function paintBody(
  kind: 'body' | 'mini' | 'flat',
  squashY: number,
  tilt: number,
  time: number,
  flowAmp: number,
): Uint8Array {
  const mask = new Uint8Array(AREA)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (insideLima(x, y, kind, squashY, tilt, time)) mask[idx(x, y)] = 1
    }
  }
  const outlineW = kind === 'mini' ? 1 : Math.max(2, Math.round(N / 64) + 1)
  const shadeW = kind === 'mini' ? 5 : Math.round(10 * (N / 64))
  const dist = distField(mask)
  const body = new Uint8Array(AREA)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, y)
      if (!mask[i]) continue
      const d = dist[i]
      if (d <= outlineW) {
        body[i] = PX.outline
        continue
      }
      const nx = (x === 0 ? d : dist[i - 1]) - (x === N - 1 ? d : dist[i + 1])
      const ny = (y === 0 ? d : dist[i - N]) - (y === N - 1 ? d : dist[i + N])
      const flow =
        Math.sin(x * 0.14 + time * 2.15) * 0.62 +
        Math.sin(y * 0.18 - time * 1.68 + Math.sin(x * 0.09 + time * 0.9)) * 0.48
      const band = flow * flowAmp
      if (
        d <= 5 &&
        nx + ny < -0.4 &&
        band < -0.15 &&
        (x + y * 3 + Math.floor(time * 10)) % 4 === 0
      ) {
        body[i] = PX.eyeHi
      } else if (d <= outlineW + shadeW && nx + ny > 0.2) {
        body[i] = PX.shade
      } else if (band > 0.32) {
        body[i] = PX.shade
      } else {
        body[i] = PX.fill
      }
    }
  }
  return body
}

function bbox(body: Uint8Array): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = N
  let minY = N
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (body[idx(x, y)] === PX.empty) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

function setCell(buf: Uint8Array, x: number, y: number, value: number): void {
  if (x < 0 || y < 0 || x >= N || y >= N) return
  if (
    buf[idx(x, y)] === PX.empty &&
    value !== PX.pupil &&
    value !== PX.eyeHi &&
    value !== PX.shadow
  ) {
    return
  }
  buf[idx(x, y)] = value
}

function setCellForce(buf: Uint8Array, x: number, y: number, value: number): void {
  if (x < 0 || y < 0 || x >= N || y >= N) return
  buf[idx(x, y)] = value
}

function fillCircle(
  buf: Uint8Array,
  cx: number,
  cy: number,
  r: number,
  value: number,
  force = false,
): void {
  const r2 = r * r
  const x0 = Math.floor(cx - r)
  const x1 = Math.ceil(cx + r)
  const y0 = Math.floor(cy - r)
  const y1 = Math.ceil(cy + r)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy > r2) continue
      if (force) setCellForce(buf, x, y, value)
      else setCell(buf, x, y, value)
    }
  }
}

function stamp(
  buf: Uint8Array,
  ox: number,
  oy: number,
  rows: string[],
  map: Record<string, number>,
  force = false,
): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.' || ch === ' ') continue
      const value = map[ch]
      if (value === undefined) continue
      if (force) setCellForce(buf, ox + x, oy + y, value)
      else setCell(buf, ox + x, oy + y, value)
    }
  }
}

/** 效果图四角星：细臂 + 中心亮点，不是实心菱形。 */
const STAR = [
  '....c....',
  '....c....',
  '..c.c.c..',
  '...clc...',
  'ccclclccc',
  '...clc...',
  '..c.c.c..',
  '....c....',
  '....c....',
]
const STAR_MAP = { c: PX.core, l: PX.coreHi }

function paintStar(body: Uint8Array, cx: number, cy: number): void {
  stamp(body, Math.round(cx) - 4, Math.round(cy) - 4, STAR, STAR_MAP)
}

function paintMouth(
  body: Uint8Array,
  cx: number,
  cy: number,
  kind: 'flat' | 'smile' | 'small',
): void {
  const x = Math.round(cx)
  const y = Math.round(cy)
  if (kind === 'smile') {
    setCell(body, x - 3, y, PX.eye)
    setCell(body, x - 2, y + 1, PX.eye)
    setCell(body, x - 1, y + 1, PX.eye)
    setCell(body, x, y + 2, PX.eye)
    setCell(body, x + 1, y + 1, PX.eye)
    setCell(body, x + 2, y + 1, PX.eye)
    setCell(body, x + 3, y, PX.eye)
    return
  }
  const w = kind === 'small' ? 1 : 2
  for (let i = -w; i <= w; i++) setCell(body, x + i, y, PX.eye)
}

function paintClosedEyes(
  body: Uint8Array,
  y: number,
  leftX: number,
  rightX: number,
  arc: boolean,
): void {
  const span = Math.max(5, Math.round(N / 16))
  for (const ox of [
    Math.round(leftX) - Math.floor(span / 2),
    Math.round(rightX) - Math.floor(span / 2),
  ]) {
    if (arc) {
      setCell(body, ox, y, PX.eye)
      for (let i = 1; i < span - 1; i++) setCell(body, ox + i, y + 1, PX.eye)
      setCell(body, ox + span - 1, y, PX.eye)
    } else {
      for (let i = 0; i < span; i++) setCell(body, ox + i, y, PX.eye)
    }
  }
}

function paintHappyEyes(body: Uint8Array, leftX: number, rightX: number, y: number): void {
  const rows = ['e.....e', '.e...e.', '..e.e..', '...e...']
  stamp(body, Math.round(leftX) - 3, Math.round(y) - 1, rows, { e: PX.eye })
  stamp(body, Math.round(rightX) - 3, Math.round(y) - 1, rows, { e: PX.eye })
}

function paintDizzyEyes(body: Uint8Array, leftX: number, rightX: number, y: number): void {
  const spiral = ['eeeee', 'e...e', 'e.ee.', 'e....', 'eeeee']
  stamp(body, Math.round(leftX) - 2, Math.round(y) - 2, spiral, { e: PX.eye })
  stamp(body, Math.round(rightX) - 2, Math.round(y) - 2, spiral, { e: PX.eye })
}

function paintPupils(
  gaze: Uint8Array,
  leftX: number,
  rightX: number,
  cy: number,
  r: number,
  lookX: number,
  lookY: number,
): void {
  const lx = leftX + lookX
  const rx = rightX + lookX
  const ey = cy + lookY
  fillCircle(gaze, lx, ey, r, PX.pupil, true)
  fillCircle(gaze, rx, ey, r, PX.pupil, true)
  const hx = 1.4
  const hy = -1.8
  setCellForce(gaze, Math.round(lx + hx), Math.round(ey + hy), PX.eyeHi)
  setCellForce(gaze, Math.round(lx + hx + 1), Math.round(ey + hy), PX.eyeHi)
  setCellForce(gaze, Math.round(lx + hx + 1), Math.round(ey + hy + 1), PX.eyeHi)
  setCellForce(gaze, Math.round(rx + hx), Math.round(ey + hy), PX.eyeHi)
  setCellForce(gaze, Math.round(rx + hx + 1), Math.round(ey + hy), PX.eyeHi)
  setCellForce(gaze, Math.round(rx + hx + 1), Math.round(ey + hy + 1), PX.eyeHi)
}

function paintGroundShadow(body: Uint8Array, cy: number, halfW: number): void {
  for (let y = 0; y < 2; y++) {
    for (let x = -halfW; x <= halfW; x++) {
      if (Math.abs(x) > halfW - y) continue
      setCellForce(body, Math.round(N / 2 + x), Math.round(cy) + y, PX.shadow)
    }
  }
}

export interface Raster {
  body: Uint8Array
  gaze: Uint8Array
}

export interface RasterOpts {
  pose: PoseId
  squashY?: number
  tilt?: number
  lookX?: number
  lookY?: number
  time?: number
  flowAmp?: number
}

function kindForPose(pose: PoseId): 'body' | 'mini' | 'flat' {
  if (pose === 'mini') return 'mini'
  if (pose === 'flat') return 'flat'
  return 'body'
}

export function rasterPose(opts: RasterOpts | PoseId): Raster {
  const pose = typeof opts === 'string' ? opts : opts.pose
  const squashY = typeof opts === 'string' ? 1 : (opts.squashY ?? 1)
  const tilt = typeof opts === 'string' ? 0 : (opts.tilt ?? 0)
  const lookX = typeof opts === 'string' ? 0 : (opts.lookX ?? 0)
  const lookY = typeof opts === 'string' ? 0 : (opts.lookY ?? 0)
  const time = typeof opts === 'string' ? 0 : (opts.time ?? 0)
  const flowAmp = typeof opts === 'string' ? 0.55 : (opts.flowAmp ?? 0.55)

  const kind = kindForPose(pose)
  const body = paintBody(kind, squashY, tilt, time, flowAmp)
  const gaze = new Uint8Array(AREA)
  const box = bbox(body)
  const w = Math.max(1, box.maxX - box.minX)
  const h = Math.max(1, box.maxY - box.minY)
  const eyeY = box.minY + h * 0.36
  const leftX = box.minX + w * 0.32
  const rightX = box.minX + w * 0.68
  const mouthY = box.minY + h * 0.5
  const starY = box.minY + h * 0.66
  const starX = (box.minX + box.maxX) / 2 + w * 0.04
  const eyeR = Math.max(3.1, w * 0.072)

  if (pose === 'mini') {
    paintPupils(gaze, leftX, rightX, eyeY, Math.max(2.2, eyeR * 0.7), lookX, lookY)
    paintMouth(body, (leftX + rightX) / 2, mouthY, 'small')
    paintStar(body, starX, starY)
    return { body, gaze }
  }
  if (pose === 'flat') {
    paintClosedEyes(body, Math.round(eyeY), leftX, rightX, false)
    paintStar(body, starX, starY)
    return { body, gaze }
  }

  switch (pose) {
    case 'blink':
      paintClosedEyes(body, Math.round(eyeY), leftX, rightX, false)
      paintMouth(body, (leftX + rightX) / 2, mouthY, 'flat')
      paintStar(body, starX, starY)
      break
    case 'success':
      paintHappyEyes(body, leftX, rightX, eyeY)
      paintMouth(body, (leftX + rightX) / 2, mouthY, 'smile')
      paintStar(body, starX, starY)
      stamp(body, box.minX - 4, box.minY + 4, ['e..', '.e.', '..e'], { e: PX.eye }, true)
      stamp(body, box.maxX + 1, box.minY + 4, ['..e', '.e.', 'e..'], { e: PX.eye }, true)
      paintGroundShadow(body, box.maxY + 3, Math.round(w * 0.28))
      break
    case 'error':
      paintDizzyEyes(body, leftX, rightX, eyeY)
      paintMouth(body, (leftX + rightX) / 2, mouthY + 1, 'flat')
      paintStar(body, starX, starY)
      break
    case 'sleeping':
      paintClosedEyes(body, Math.round(eyeY), leftX, rightX, true)
      paintMouth(body, (leftX + rightX) / 2, mouthY, 'small')
      paintStar(body, starX, starY)
      stamp(
        body,
        box.maxX - 2,
        Math.max(1, box.minY - 10),
        ['.oooooo.', 'o......o', 'o..eee.o', 'o...e..o', 'o.eee..o', '.oooooo.', '..o.....'],
        { o: PX.outline, e: PX.eye },
        true,
      )
      break
    default:
      paintPupils(gaze, leftX, rightX, eyeY, eyeR, lookX, lookY)
      paintMouth(body, (leftX + rightX) / 2, mouthY, 'flat')
      paintStar(body, starX, starY)
  }

  return { body, gaze }
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function indicesToRgba(
  indices: Uint8Array,
  palette: Record<string, string>,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(indices.length * 4)
  for (let i = 0; i < indices.length; i++) {
    const p = indices[i]
    if (p === PX.empty) continue
    const key = PIXEL_KEYS[p]
    const hex = key ? palette[key] : undefined
    if (!hex) continue
    const [r, g, b] = parseHex(hex)
    const o = i * 4
    rgba[o] = r
    rgba[o + 1] = g
    rgba[o + 2] = b
    rgba[o + 3] = 255
  }
  return rgba
}

export interface ComposeOpts {
  pose: PoseId
  palette: Record<string, string>
  squashY?: number
  tilt?: number
  lookX?: number
  lookY?: number
  time?: number
  flowAmp?: number
  hop?: number
  corePulse?: boolean
}

/** 合成一帧：豆内焦散水流 + 轮廓微波。 */
export function composeFrame(opts: ComposeOpts): Uint8ClampedArray {
  const { palette } = opts
  const raster = rasterPose({
    pose: opts.pose,
    squashY: opts.squashY ?? 1,
    tilt: opts.tilt ?? 0,
    lookX: opts.lookX ?? 0,
    lookY: opts.lookY ?? 0,
    time: opts.time ?? 0,
    flowAmp: opts.flowAmp ?? 0.55,
  })
  const merged = new Uint8Array(AREA)
  const hop = opts.hop ?? 0
  if (hop === 0) {
    merged.set(raster.body)
    for (let i = 0; i < AREA; i++) {
      if (raster.gaze[i]) merged[i] = raster.gaze[i]
    }
  } else {
    for (let i = 0; i < AREA; i++) {
      if (raster.body[i] === PX.shadow) merged[i] = PX.shadow
    }
    for (let y = 0; y < N; y++) {
      const ny = y + hop
      if (ny < 0 || ny >= N) continue
      for (let x = 0; x < N; x++) {
        const v = raster.body[y * N + x]
        if (v === PX.empty || v === PX.shadow) continue
        merged[ny * N + x] = v
        const g = raster.gaze[y * N + x]
        if (g) merged[ny * N + x] = g
      }
    }
  }
  if (opts.corePulse) {
    for (let i = 0; i < AREA; i++) {
      if (merged[i] === PX.core) merged[i] = PX.coreHi
    }
  }
  return indicesToRgba(merged, palette)
}

/** Loading：像素水面。宽 192、高 64，波浪连续、输出贴格。 */
export const TIDE_W = 192
export const TIDE_H = 64

export function composeTide(palette: Record<string, string>, time: number): Uint8ClampedArray {
  const buf = new Uint8Array(TIDE_W * TIDE_H)
  const swellX = ((time * 32) % (TIDE_W + 60)) - 30
  for (let x = 0; x < TIDE_W; x++) {
    const n1 = Math.sin(x * 0.1 + time * 2.35)
    const n2 = Math.sin(x * 0.23 - time * 3.1 + 1.1)
    const n3 = Math.sin(x * 0.47 + time * 1.55)
    const swell = 10 * Math.exp(-((x - swellX) ** 2) / 280)
    const height = 20 + 10 * n1 + 5 * n2 + 2.4 * n3 + swell
    const surface = TIDE_H - 1 - Math.round(height)
    for (let y = TIDE_H - 1; y >= Math.max(0, surface); y--) {
      const depth = y - surface
      let pixel = PX.fill as number
      if (depth === 0) pixel = PX.outline
      else if (depth === 1 && n1 + n2 > 0.45) pixel = PX.eyeHi
      else if (depth > height * 0.5) pixel = PX.shade
      else if (Math.sin(x * 0.18 + y * 0.35 - time * 2.2) > 0.5) pixel = PX.shade
      buf[y * TIDE_W + x] = pixel
    }
  }
  return indicesToRgba(buf, palette)
}

export function poseForState(state: string, blink: boolean): PoseId {
  if (state === 'idle' && blink) return 'blink'
  if (state === 'success') return 'success'
  if (state === 'error') return 'error'
  if (state === 'sleeping') return 'sleeping'
  if (state === 'loading') return 'idle'
  return 'idle'
}

/** 测试用：静态 pose 栅格。 */
export function cachedRaster(pose: PoseId): Raster {
  return rasterPose(pose)
}
