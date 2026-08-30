/**
 * v4「长春花蓝」皮肤 —— 纯调色板数据（颜色字面量特许例外：仅 skins/*.ts，宪法 §5）。
 * 色阶与 PixelBean v4 同族（mid 沿用品牌 fill #8d92e6、shadow 沿用 #6e74d2），保证品牌连续；
 * outline 较 PixelBean 略微提亮，暗色背景下轮廓不沉死（spec §2.5 暗部不过黑）。
 */

import type { OrbSkinDefinition } from '../types'

export const V4_ORB_SKIN: OrbSkinDefinition = {
  id: 'v4',
  label: '长春花蓝',
  palette: {
    highlight: '#dfe1ff', // 高光（左上光源直射区，不过曝）
    light: '#b3b8f4', // 亮部
    mid: '#8d92e6', // 中间调（品牌长春花蓝）
    shadow: '#6e74d2', // 暗部
    outline: '#123b43', // 深青轮廓
    eye: '#061b22', // 表情核心（近黑深青）
    eyeHi: '#ffffff', // 眼内单像素高光
  },
}
