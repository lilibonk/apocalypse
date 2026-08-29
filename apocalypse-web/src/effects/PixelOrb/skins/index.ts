/**
 * 皮肤注册表：新增皮肤只加 skins/*.ts 数据文件并在此登记，禁止改动渲染器（宪法 §5）。
 */

import type { OrbSkinDefinition, SkinId } from '../types'

import { V3_ORB_SKIN } from './v3'
import { V4_ORB_SKIN } from './v4'

export const ORB_SKINS: Record<SkinId, OrbSkinDefinition> = {
  v3: V3_ORB_SKIN,
  v4: V4_ORB_SKIN,
}

/** 默认皮肤：v3 薄荷青（像素蝾螈品牌默认；DEFINITION §2）。 */
export const DEFAULT_ORB_SKIN: SkinId = 'v3'
