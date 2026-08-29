/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 *
 * 皮肤注册表：新增皮肤只加 skins/*.ts 数据文件并在此登记，禁止改动组件（宪法 §5）。
 */

import type { SkinDefinition, SkinId } from '../types'

import { V3_SKIN } from './v3'
import { V4_SKIN } from './v4'

export const SKINS: Record<SkinId, SkinDefinition> = {
  v3: V3_SKIN,
  v4: V4_SKIN,
}

/** 默认皮肤：v4 长春花蓝（品牌基调去绿色化；v3 薄荷青保留为可选项）。 */
export const DEFAULT_SKIN: SkinId = 'v4'
