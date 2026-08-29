/**
 * v3「薄荷青」皮肤 —— 纯调色板数据（颜色字面量特许例外：仅 skins/*.ts，宪法 §5）。
 * 与 v4 形状完全一致（共享 draw.ts 球体栅格），仅身体色系换为薄荷青（mint）；
 * mid/shadow 沿用 PixelBean v3 的品牌色，outline/eye 与 v4 保持一致。
 */

import type { OrbSkinDefinition } from '../types'

export const V3_ORB_SKIN: OrbSkinDefinition = {
  id: 'v3',
  label: '薄荷青',
  palette: {
    highlight: '#d8f8ef', // 高光（左上光源直射区，不过曝）
    light: '#79dcc8', // 亮部
    mid: '#3fc7ad', // 中间调（品牌薄荷青）
    shadow: '#2aa88d', // 暗部
    outline: '#123b43', // 瞳孔外圈（深青，贴合蝾螈母版）
    eye: '#061b22', // 瞳孔核心（近黑深青）
    eyeHi: '#ffffff', // 横向观测窗内的矩形高亮信号段
  },
}
