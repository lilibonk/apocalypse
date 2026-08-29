/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 *
 * v4「长春花蓝」皮肤 —— 纯调色板数据（颜色字面量特许例外：仅 skins/*.ts，宪法 §5）。
 * 与 v3 形状完全一致（共享 draw.ts 栅格），仅身体色系换为长春花蓝（periwinkle）。
 */

import type { SkinDefinition } from '../types'

export const V4_SKIN: SkinDefinition = {
  id: 'v4',
  label: '长春花蓝',
  palette: {
    outline: '#1b1c26', // 近黑描边
    fill: '#8d92e6', // 长春花蓝身体
    shade: '#6e74d2', // 单侧深色阴影
    eye: '#101218', // 眼睛/嘴/Z/速度线
    eyeHi: '#ffffff', // 眼部高光
    core: '#f0a836', // 琥珀星核
    coreHi: '#ffd166', // 星核高光
    shadow: '#9aa1a8', // 落地灰影
  },
}
