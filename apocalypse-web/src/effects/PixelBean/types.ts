/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 */

/** PixelBean 皮肤 id：v3 薄荷青 / v4 长春花蓝。 */
export type SkinId = 'v3' | 'v4'

/**
 * 状态词汇表（固定，全站共用同一组件表达状态语义，见 src/effects/README.md）。
 * thinking 为 2 期 Agent 界面化身预留，不得在无关场景挪用（宪法 §5）。
 */
export type BeanState =
  'idle' | 'waiting' | 'loading' | 'thinking' | 'success' | 'error' | 'sleeping'

/**
 * 皮肤 = 纯调色板数据；形状由 draw.ts 64×64 栅格共享，换肤只换色不换形。
 * palette 键为语义名（outline/fill/shade/eye/eyeHi/core/coreHi/shadow），
 * 像素索引 → palette 键见 draw.ts 的 PIXEL_KEYS。
 */
export interface SkinDefinition {
  id: SkinId
  label: string
  /** 语义键 → 颜色字面量（字面量特许例外：仅允许出现在 skins/*.ts，宪法 §5）。 */
  palette: Record<string, string>
}
