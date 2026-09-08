/**
 * PixelOrb 新品牌兼容契约（docs/brand-slime/solution-fit.md）。
 *
 * 状态词表固定为 idle / waiting / success / error / sleeping：
 * loading 语义并入 waiting；thinking 为 2 期 Agent 界面化身预留、当前不实现（宪法 §5）。
 */

/** 历史皮肤 id，仅为调用兼容；批准设计稿固定使用 mint，不再在运行时重着色。 */
export type SkinId = 'v3' | 'v4'

/** 状态词汇表（固定，全站共用同一组件表达状态语义，见 src/effects/README.md）。 */
export type OrbState = 'idle' | 'waiting' | 'success' | 'error' | 'sleeping'

/**
 * 历史代码精灵的 palette 语义键，仅供旧皮肤数据保持类型兼容。
 */
export type OrbPaletteKey =
  | 'highlight' // 高光（左上光源直射区，极亮）
  | 'light' // 亮部
  | 'mid' // 中间调（品牌主色）
  | 'shadow' // 暗部
  | 'outline' // 轮廓/描边
  | 'eye' // 眼睛与状态表情的深色笔画
  | 'eyeHi' // 眼内单格高光

/**
 * 历史皮肤定义；正式 PixelOrb 使用固定 mint 史莱姆，不消费该调色板。
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
  /** 历史兼容属性；批准设计稿固定使用 mint，不再重着色。 */
  skin?: SkinId
  /** CSS 尺寸（px），合法值 384/256/128/64/32；大尺寸交互、小尺寸静态，非法值开发环境 throw */
  size?: number
  /** idle 时眼睛沿皮肤平滑跟随鼠标；静态/闭眼时居中，默认关闭，登录显式启用。 */
  gaze?: boolean
  className?: string
}
