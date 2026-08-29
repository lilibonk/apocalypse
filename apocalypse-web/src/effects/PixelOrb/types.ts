/**
 * PixelOrb 类型契约（docs/pixel-wave-spec.md §7.1）。
 *
 * 状态词表固定为 idle / waiting / success / error / sleeping：
 * loading 语义并入 waiting；thinking 为 2 期 Agent 界面化身预留、当前不实现（宪法 §5）。
 */

/** 皮肤 id：v3 薄荷青 / v4 长春花蓝（与全局 mascotSkin 沿用同一 SkinId）。 */
export type SkinId = 'v3' | 'v4'

/** 状态词汇表（固定，全站共用同一组件表达状态语义，见 src/effects/README.md）。 */
export type OrbState = 'idle' | 'waiting' | 'success' | 'error' | 'sleeping'

/**
 * palette 语义键：色阶量化（draw.ts quantizeShade）与眼睛渲染（eyes.ts）的唯一取色口。
 * 颜色字面量特许例外仅允许出现在 skins/*.ts（宪法 §5）。
 */
export type OrbPaletteKey =
  | 'highlight' // 高光（左上光源直射区，极亮）
  | 'light' // 亮部
  | 'mid' // 中间调（品牌主色）
  | 'shadow' // 暗部
  | 'outline' // 轮廓/描边
  | 'eye' // 信号视窗内的深色故障/状态笔画（spec §2.2）
  | 'eyeHi' // 信号视窗的高亮矩形段

/**
 * 皮肤 = 纯调色板数据；球体形状由 draw.ts 128×128 SDF 共享，换肤只换色不换形。
 * 新增皮肤只允许新增 skins/*.ts 数据文件并登记，不动渲染器（宪法 §5）。
 */
export interface OrbSkinDefinition {
  id: SkinId
  label: string
  /** 语义键 → 颜色字面量（字面量特许例外：仅 skins/*.ts）。 */
  palette: Record<OrbPaletteKey, string>
}

/** 组件 props（spec §7.1）。 */
export interface PixelOrbProps {
  /** 状态，默认 'idle' */
  state?: OrbState
  /** 皮肤，缺省取全局 mascotSkin */
  skin?: SkinId
  /** CSS 尺寸（px），合法值 256/128/64/32（32 为图标态），非法值开发环境 throw */
  size?: number
  /** 是否启用视线跟随，默认 false */
  gaze?: boolean
  className?: string
}
