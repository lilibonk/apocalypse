/**
 * PixelOrb 球体渲染（spec §2.2 视觉规格 / §9.1 SDF / §9.2 色阶量化）。
 *
 * 正圆 SDF + 法线光照（左上光源 diffuse + specular + rim），明度量化 5 级色阶，
 * 输出纯数据栅格（palette 键名一维数组）——计算与渲染分离，可单测：
 * 栅格本身不含颜色，颜色经 resolvePalette / rasterToRgba 在上屏前解析。
 * 眼睛绘制在 eyes.ts；帧组装（身体 + 眼睛）见 eyes.ts 的 composeOrb。
 */

import { ORB_GRID } from './size'
import type { OrbPaletteKey } from './types'

export const N = ORB_GRID
const AREA = N * N

/** 球体几何（内部栅格坐标）：居中，半径 62（边缘留 2 格余量，微倾/位移不裁切）。 */
export const ORB_CX = N / 2
export const ORB_CY = N / 2
export const ORB_RADIUS = 62

/** 轮廓环宽（格）：SDF 距离梯度排列，边缘整齐无锯齿毛刺（§2.5）。 */
const OUTLINE_W = 2

/** 纯数据栅格：palette 键名 / null=透明，长度 N×N，行优先。 */
export type OrbRaster = (OrbPaletteKey | null)[]

// ---------- §9.1 球体 SDF ----------

export interface SphereSample {
  inside: boolean
  /** 到边缘的向内距离（格；球外为负），用于轮廓环与边缘裁剪 */
  dist: number
  /** 法线分量（nx²+ny² ≤ 1 于球内），用于法线近似 */
  nx: number
  ny: number
}

export function spherePixel(x: number, y: number, cx: number, cy: number, r: number): SphereSample {
  const dx = x - cx
  const dy = y - cy
  const d = Math.sqrt(dx * dx + dy * dy)
  return { inside: d <= r, dist: r - d, nx: dx / r, ny: dy / r }
}

// ---------- §2.2 法线光照（左上光源） ----------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** 光源方向：左上（单位向量，spec §2.2）。 */
const LX = -0.5
const LY = -0.5
const LZ = 0.707

// 原始组合值（shade*0.7 + spec*0.4 + rim）在圆盘上的实测值域约 [-0.23, 0.78]；
// 仿射归一化到 0~1，保证 quantizeShade 的五级色阶全部被使用（§2.5 ≥3 明度色阶），
// 高光带收敛为左上集中光斑（§2.2 高光区，扫描定参：highlight≈8% / shadow≈14%）。
const SHADE_MIN = -0.42
const SHADE_MAX = 0.88

/**
 * §2.2 sphereShade：diffuse + specular + rim，输出归一化 0~1。
 * 高光区在左上（法线对齐光源处），右下最暗，边缘有 subtle 反光带。
 */
export function sphereShade(nx: number, ny: number): number {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
  // Diffuse
  const shade = nx * LX + ny * LY + nz * LZ
  // Specular highlight（高光区）
  const hx = (nx + LX) / 2
  const hy = (ny + LY) / 2
  const hz = (nz + LZ) / 2
  const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz)
  const spec = Math.pow(Math.max(0, (nz * hz) / hLen), 16)
  // Rim light（边缘反光）
  const rim = Math.pow(1 - nz, 3) * 0.3
  return clamp01((shade * 0.7 + spec * 0.4 + rim - SHADE_MIN) / (SHADE_MAX - SHADE_MIN))
}

// ---------- §9.2 体积感色阶量化 ----------

/** 光照强度 → 5 级像素色阶（像素画色带感；边界为严格大于，§9.2）。 */
export function quantizeShade(shade: number): OrbPaletteKey {
  if (shade > 0.85) return 'highlight'
  if (shade > 0.6) return 'light'
  if (shade > 0.35) return 'mid'
  if (shade > 0.15) return 'shadow'
  return 'outline'
}

// ---------- 栅格基元（纯数据写入，越界静默忽略） ----------

export function createRaster(): OrbRaster {
  return new Array<OrbPaletteKey | null>(AREA).fill(null)
}

export function setPx(buf: OrbRaster, x: number, y: number, key: OrbPaletteKey): void {
  const gx = Math.round(x)
  const gy = Math.round(y)
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return
  buf[gy * N + gx] = key
}

export function fillCircle(
  buf: OrbRaster,
  cx: number,
  cy: number,
  r: number,
  key: OrbPaletteKey,
): void {
  fillEllipse(buf, cx, cy, r, r, key)
}

export function fillEllipse(
  buf: OrbRaster,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  key: OrbPaletteKey,
): void {
  if (rx <= 0 || ry <= 0) return
  const x0 = Math.max(0, Math.floor(cx - rx))
  const x1 = Math.min(N - 1, Math.ceil(cx + rx))
  const y0 = Math.max(0, Math.floor(cy - ry))
  const y1 = Math.min(N - 1, Math.ceil(cy + ry))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx
      const dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1) buf[y * N + x] = key
    }
  }
}

/** 字符画盖章：'.'/' ' 为透明，其余字符经 map 映射到 palette 键。 */
export function stamp(
  buf: OrbRaster,
  ox: number,
  oy: number,
  rows: readonly string[],
  map: Record<string, OrbPaletteKey>,
): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    for (let x = 0; x < row.length; x++) {
      const key = map[row[x]]
      if (key === undefined) continue
      setPx(buf, ox + x, oy + y, key)
    }
  }
}

// ---------- 球体身体 ----------

/**
 * 球体身体：SDF 边缘裁剪 → 轮廓环（距离梯度）→ 法线光照 5 级色阶。
 * 无时间参数，结果对同一档位恒定，可在组件内缓存复用。
 */
export function rasterizeBody(): OrbRaster {
  const buf = createRaster()
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const s = spherePixel(x + 0.5, y + 0.5, ORB_CX, ORB_CY, ORB_RADIUS)
      if (!s.inside) continue
      buf[y * N + x] = s.dist < OUTLINE_W ? 'outline' : quantizeShade(sphereShade(s.nx, s.ny))
    }
  }
  return buf
}

// ---------- 上屏（栅格 + palette → RGBA） ----------

export type Rgb = readonly [number, number, number]
export type ResolvedPalette = Record<OrbPaletteKey, Rgb>

function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ] as const
}

/** palette 键 → RGB 预解析（组件内按皮肤 useMemo，避免逐帧解析 hex）。 */
export function resolvePalette(palette: Record<OrbPaletteKey, string>): ResolvedPalette {
  return {
    highlight: parseHex(palette.highlight),
    light: parseHex(palette.light),
    mid: parseHex(palette.mid),
    shadow: parseHex(palette.shadow),
    outline: parseHex(palette.outline),
    eye: parseHex(palette.eye),
    eyeHi: parseHex(palette.eyeHi),
  }
}

export function rasterToRgba(raster: OrbRaster, palette: ResolvedPalette): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(raster.length * 4)
  for (let i = 0; i < raster.length; i++) {
    const key = raster[i]
    if (key === null) continue
    const [r, g, b] = palette[key]
    const o = i * 4
    rgba[o] = r
    rgba[o + 1] = g
    rgba[o + 2] = b
    rgba[o + 3] = 255
  }
  return rgba
}
