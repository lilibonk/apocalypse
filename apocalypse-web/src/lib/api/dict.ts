/** 字典端点。 */

import { request } from './client'
import type { DictData } from './types'

/** 按类型取字典数据（下拉/标签渲染用，仅启用项由后端过滤）。 */
export function getDictDataByType(type: string): Promise<DictData[]> {
  return request<DictData[]>(`/system/dict/data/type/${type}`)
}
