/**
 * 字典卡片册端点（页面局部，复用既有字典接口，不新增契约）。
 * - GET /system/dict/types/page（system:dict:list）
 * - GET /system/dict/data/type/{type}（启用值，用于折叠卡片的值预览）
 * - GET /system/dict/data/page?dictType=（含停用值，用于展开卡片）
 * - POST/PUT/DELETE /system/dict/data（system:dict:add/edit/remove）
 */

import { request, type RequestOptions } from '@/lib/api/client'
import type { PageResult, SnowflakeId } from '@/lib/api/types'

export const DICT_BOOK_PAGE_SIZE = 200

export interface DictTypeRow {
  id: SnowflakeId
  dictType: string
  dictName: string
  status: number
  remark: string | null
}

export interface DictValueRow {
  id: SnowflakeId
  dictType: string
  dictLabel: string
  dictValue: string
  sort: number | null
  status: number
  remark: string | null
}

type Transport = Pick<RequestOptions, 'signal' | 'context'>

export function pageDictTypes(keyword: string, signal?: AbortSignal) {
  return request<PageResult<DictTypeRow>>('/system/dict/types/page', {
    query: { page: 1, size: DICT_BOOK_PAGE_SIZE, keyword: keyword || undefined },
    signal,
  })
}

export function enabledDictValues(type: string, signal?: AbortSignal) {
  return request<DictValueRow[]>(`/system/dict/data/type/${encodeURIComponent(type)}`, { signal })
}

export function pageDictValues(type: string, signal?: AbortSignal) {
  return request<PageResult<DictValueRow>>('/system/dict/data/page', {
    query: { page: 1, size: DICT_BOOK_PAGE_SIZE, dictType: type },
    signal,
  })
}

export function createDictValue(body: Record<string, unknown>, transport: Transport = {}) {
  return request<SnowflakeId>('/system/dict/data', { method: 'POST', body, ...transport })
}

export function updateDictValue(
  id: SnowflakeId,
  body: Record<string, unknown>,
  transport: Transport = {},
) {
  return request<void>(`/system/dict/data/${id}`, { method: 'PUT', body, ...transport })
}

export function deleteDictValue(id: SnowflakeId, transport: Transport = {}) {
  return request<void>(`/system/dict/data/${id}`, { method: 'DELETE', ...transport })
}
