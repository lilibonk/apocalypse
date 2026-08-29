/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 *
 * v3「薄荷青」皮肤 —— 纯调色板数据（颜色字面量特许例外：仅 skins/*.ts，宪法 §5）。
 * 键为 palette 语义名，像素索引映射见 draw.ts 的 PIXEL_KEYS；新增皮肤照此形状即可。
 */

import type { SkinDefinition } from '../types'

export const V3_SKIN: SkinDefinition = {
  id: 'v3',
  label: '薄荷青',
  palette: {
    outline: '#1b1c26', // 近黑描边
    fill: '#3fc7ad', // 薄荷青身体
    shade: '#2aa88d', // 单侧深色阴影
    eye: '#101218', // 眼睛/嘴/Z/速度线
    eyeHi: '#ffffff', // 眼部高光
    core: '#f0a836', // 琥珀星核
    coreHi: '#ffd166', // 星核高光
    shadow: '#9aa1a8', // 落地灰影
  },
}
