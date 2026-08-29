/**
 * PixelWave Canvas 渲染（v2.10，docs/pixel-wave-spec.md §22）。
 *
 * 只画 ON 格，表达为**彩色淡流光**：方块本体即页面背景（白底白块 / 黑底黑块，
 * 透明即底色），每格绘制 ① 柔和半透彩色软填充（alpha = WAVE_FILL_ALPHA，统一
 * 低透明度淡彩——禁止的是连续渐变造波，统一半透明不是渐变）② 淡彩边框
 * （alpha = WAVE_BORDER_ALPHA，4 条 fillRect 边线，厚度 block/10 夹下限 2，
 * 像素锐利）。按 hue 道（HUE_LANES）分桶，fillStyle 每道至多设一次（程序化
 * oklch 字符串，宪法 §5 程序化取色豁免，禁 hex 字面量 / 色板文件）。oklch 不
 * 支持的浏览器由组件侧把整组道色回退为 --brand（淡流光退化为单色，语言不塌）。
 */

import { HUE_LANES } from './wave'

/** 淡流光软填充透明度（柔和半透，统一值非渐变） */
export const WAVE_FILL_ALPHA = 0.42
/** 淡彩边框透明度（勾勒方块轮廓，比填充略实） */
export const WAVE_BORDER_ALPHA = 0.78
/** 登录铅字的最大挤出高度 = blockSize × 该倍率（terrain 后再夹取）。 */
export const LETTERPRESS_MAX_HEIGHT_RATIO = 1.45
/** 剪影流光线芯峰值透明度；顶面本体永不使用该颜色。 */
export const LETTERPRESS_GLOW_ALPHA = 0.68
/** 剪影外沿峰值透明度。 */
export const LETTERPRESS_HALO_ALPHA = 0.1
/** 远端侧壁以前景色低透明叠加，明暗主题都得到克制灰阶而非白条/黑条。 */
export const LETTERPRESS_SIDE_DEPTH_ALPHA = 0.34

export interface LetterpressPalette {
  /** 铅字顶面：严格等于页面背景 token。 */
  face: string
  /** 侧壁靠近顶面的灰阶。 */
  sideTop: string
  /** 侧壁靠近底座的灰阶。 */
  sideBottom: string
}

/** 从元素计算样式解析 --brand（token-only；兜底链 --primary → 计算色，均非颜色字面量）。 */
export function resolveBrandColor(el: Element): string {
  const style = getComputedStyle(el)
  const brand = style.getPropertyValue('--brand').trim()
  if (brand) return brand
  const primary = style.getPropertyValue('--primary').trim()
  if (primary) return primary
  return style.color
}

/**
 * 解析登录铅字的无彩色材质。顶面只取 --background；侧壁只取中性
 * --border/--foreground（后者低透明叠加）。所有彩色都由 renderLetterpressField
 * 单独限制在剪影边缘。
 */
export function resolveLetterpressPalette(el: Element): LetterpressPalette {
  const style = getComputedStyle(el)
  const rootStyle = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || rootStyle.getPropertyValue(name).trim() || fallback
  const pageBackground = getComputedStyle(document.body).backgroundColor
  return {
    face: token('--background', pageBackground),
    sideTop: token('--border', style.color),
    sideBottom: token('--foreground', style.color),
  }
}

/**
 * 解析 --brand 自定义属性的 oklch hue（五彩基准相位）。
 * 自定义属性按声明原样返回（tokens.css 预设组均为 oklch 字面量写法）；
 * 非 oklch 写法 / 解析失败回退 null（组件侧用 DEFAULT_BASE_HUE）。
 */
export function resolveBrandHue(el: Element): number | null {
  const raw = getComputedStyle(el).getPropertyValue('--brand').trim()
  const match = /oklch\(\s*[\d.]+%?\s+[\d.]+%?\s+(-?[\d.]+)/.exec(raw)
  if (!match) return null
  const hue = Number(match[1])
  return Number.isFinite(hue) ? hue : null
}

/** oklch 支持探测：canvas fillStyle 直接吃 oklch 字符串的前提（不支持 → 组件回退 --brand）。 */
export function supportsOklch(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('color', 'oklch(0.7 0.1 250)')
  )
}

/**
 * 五彩道色（程序化 oklch，宪法 §5 豁免）：明度/彩度按明暗主题分两档（暗色降低 L
 * 防刺眼）；道 hue 取道中点，同参同果可单测。禁 hex 字面量、禁色板文件。
 */
export function oklchLaneColors(dark: boolean): string[] {
  const l = dark ? 0.6 : 0.72
  const c = dark ? 0.16 : 0.19
  const colors: string[] = []
  for (let lane = 0; lane < HUE_LANES; lane++) {
    const hue = ((lane + 0.5) * 360) / HUE_LANES
    colors.push(`oklch(${l} ${c} ${hue})`)
  }
  return colors
}

/**
 * 逐格绘制彩色淡流光（§19）：只画 field === 1 的格——每格先画 WAVE_FILL_ALPHA
 * 半透软填充，再画 WAVE_BORDER_ALPHA 淡彩边框（4 条 fillRect 边线，厚度
 * blockSize/10 取整夹下限 2）；按 hue 道分桶设色（每道至多一次 fillStyle 赋值）。
 */
export function renderTypeField(
  ctx: CanvasRenderingContext2D,
  field: Uint8Array,
  lanes: Uint8Array,
  gridW: number,
  gridH: number,
  blockSize: number,
  gap: number,
  colors: readonly string[],
): void {
  const step = blockSize + gap
  const border = Math.max(2, Math.round(blockSize / 10)) // 淡彩边框厚度（像素锐利）
  for (let lane = 0; lane < colors.length; lane++) {
    const color = colors[lane]
    if (!color) continue
    let active = false
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const i = y * gridW + x
        if (field[i] !== 1 || lanes[i] !== lane) continue
        if (!active) {
          ctx.fillStyle = color
          active = true
        }
        const px = x * step
        const py = y * step
        // ① 柔和半透软填充（淡流光本体）
        ctx.globalAlpha = WAVE_FILL_ALPHA
        ctx.fillRect(px, py, blockSize, blockSize)
        // ② 淡彩边框（4 条边线，勾勒方块轮廓）
        ctx.globalAlpha = WAVE_BORDER_ALPHA
        ctx.fillRect(px, py, blockSize, border) // 上
        ctx.fillRect(px, py + blockSize - border, blockSize, border) // 下
        ctx.fillRect(px, py, border, blockSize) // 左
        ctx.fillRect(px + blockSize - border, py, border, blockSize) // 右
      }
    }
  }
  ctx.globalAlpha = 1.0
}

/**
 * 登录专用活字浮雕：
 * 1. 侧壁用 --border / 低透明 --foreground 两级灰阶表达抬升；
 * 2. 顶面严格填 --background（亮色白块、暗色黑块）；
 * 3. 程序化彩色只画 2px 剪影线芯和极淡外沿，不染顶面。
 *
 * 所有写入 canvas 的坐标与尺寸均取整；field/lifts 的 OFF 格零渲染。
 */
export function renderLetterpressField(
  ctx: CanvasRenderingContext2D,
  field: Uint8Array,
  lifts: Float32Array,
  lanes: Uint8Array,
  gridW: number,
  gridH: number,
  blockSize: number,
  gap: number,
  colors: readonly string[],
  palette: LetterpressPalette,
): void {
  const step = blockSize + gap
  const maxHeight = Math.max(1, Math.round(blockSize * LETTERPRESS_MAX_HEIGHT_RATIO))
  const core = Math.max(1, Math.min(2, Math.round(blockSize / 8)))
  const halo = Math.max(core, Math.min(4, core * 2))

  // 从上行向下行绘制，让靠下的铅字自然盖住后排脚座。
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const i = y * gridW + x
      if (field[i] !== 1 || lifts[i] <= 0) continue

      const energy = Math.min(1, lifts[i])
      const height = Math.max(1, Math.round(Math.min(1.35, lifts[i]) * maxHeight))
      const px = x * step
      const baseY = y * step
      const topY = baseY - height
      const sideY = topY + blockSize
      const split = Math.max(1, Math.round(height * 0.55))

      // 灰阶侧壁：两级离散阶梯，保持像素机械感。
      ctx.globalAlpha = 1
      ctx.fillStyle = palette.sideTop
      ctx.fillRect(px, sideY, blockSize, split)
      if (height > split) {
        ctx.fillStyle = palette.sideBottom
        ctx.globalAlpha = LETTERPRESS_SIDE_DEPTH_ALPHA * (0.65 + energy * 0.35)
        ctx.fillRect(px, sideY + split, blockSize, height - split)
      }

      // 顶面最后覆盖侧壁连接处，且始终与页面背景完全同色。
      ctx.globalAlpha = 1
      ctx.fillStyle = palette.face
      ctx.fillRect(px, topY, blockSize, blockSize)

      const glow = colors[lanes[i] % Math.max(1, colors.length)]
      if (!glow) continue
      const silhouetteHeight = blockSize + height

      // 极淡外沿：只沿整个浮雕剪影四边，绝不覆盖块面中央。
      ctx.fillStyle = glow
      ctx.globalAlpha = LETTERPRESS_HALO_ALPHA * energy
      ctx.fillRect(px - halo, topY - halo, blockSize + halo * 2, halo)
      ctx.fillRect(px - halo, topY + silhouetteHeight, blockSize + halo * 2, halo)
      ctx.fillRect(px - halo, topY, halo, silhouetteHeight)
      ctx.fillRect(px + blockSize, topY, halo, silhouetteHeight)

      // 流光线芯：随当波 hue 纹理换新，严格限制在 1~2px 剪影边缘。
      ctx.globalAlpha = LETTERPRESS_GLOW_ALPHA * energy
      ctx.fillRect(px, topY, blockSize, core)
      ctx.fillRect(px, topY + silhouetteHeight - core, blockSize, core)
      ctx.fillRect(px, topY, core, silhouetteHeight)
      ctx.fillRect(px + blockSize - core, topY, core, silhouetteHeight)
    }
  }
  ctx.globalAlpha = 1
}
