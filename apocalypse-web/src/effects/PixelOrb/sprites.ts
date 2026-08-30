/** 批准设计稿的 3×2 透明状态母版；每格原始尺寸为 512×512。 */

import type { OrbState } from './types'

export const MINT_BONK_SPRITE_SHEET = '/brand/mint-bonk-design-sprites-v1.png'
export const MINT_BONK_SHEET_COLUMNS = 3
export const MINT_BONK_SHEET_ROWS = 2
export const MINT_BONK_SOURCE_CELL_SIZE = 512

export interface OrbSpriteCell {
  column: 0 | 1 | 2
  row: 0 | 1
}

/**
 * 设计稿语义：左上 idle、中上 waiting、右上 success、左下 error、中下 sleeping。
 * 右下是背面设定稿，只作为角色形状参考，不对应产品状态。
 */
export const ORB_STATE_CELLS = {
  idle: { column: 0, row: 0 },
  waiting: { column: 1, row: 0 },
  success: { column: 2, row: 0 },
  error: { column: 0, row: 1 },
  sleeping: { column: 1, row: 1 },
} as const satisfies Record<OrbState, OrbSpriteCell>
