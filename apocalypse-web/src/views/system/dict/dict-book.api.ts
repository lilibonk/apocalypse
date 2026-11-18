/**
 * 字典卡片册端点：
 * - GET /system/dict/types/page（system:dict:list）
 * - GET /system/dict/data/batch?dictTypes=（批量拉取当前页字典类型的启用+停用全量项，计算启停比例与色卡）
 * - GET /system/dict/data/type/{type}（启用值）
 * - GET /system/dict/data/page?dictType=（含停用值分页，用于展开卡片）
 * - POST/PUT/DELETE /system/dict/data（system:dict:add/edit/remove）
 */

import { request, type RequestOptions } from '@/lib/api/client'
import type { DictTone, PageResult, SnowflakeId } from '@/lib/api/types'

export const DICT_BOOK_PAGE_SIZE = 12
export const DICT_VALUE_PAGE_SIZE = 20

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
  tagTone?: DictTone | null
  isDefault?: number | null
  remark: string | null
}

type Transport = Pick<RequestOptions, 'signal' | 'context'>

export function pageDictTypes(
  keyword: string,
  page: number,
  signal?: AbortSignal,
  status?: number,
) {
  return request<PageResult<DictTypeRow>>('/system/dict/types/page', {
    query: {
      page,
      size: DICT_BOOK_PAGE_SIZE,
      keyword: keyword || undefined,
      status,
    },
    signal,
  })
}

export function batchDictValues(dictTypes: readonly string[], signal?: AbortSignal) {
  const normalized = Array.from(new Set(dictTypes.map((item) => item.trim()).filter(Boolean)))
  if (normalized.length === 0) {
    return Promise.resolve<Record<string, DictValueRow[]>>({})
  }
  return request<Record<string, DictValueRow[]>>('/system/dict/data/batch', {
    query: { dictTypes: normalized.join(',') },
    signal,
  })
}

export function enabledDictValues(type: string, signal?: AbortSignal) {
  return request<DictValueRow[]>(`/system/dict/data/type/${encodeURIComponent(type)}`, { signal })
}

export function pageDictValues(type: string, page: number, signal?: AbortSignal) {
  return request<PageResult<DictValueRow>>('/system/dict/data/page', {
    query: { page, size: DICT_VALUE_PAGE_SIZE, dictType: type },
    signal,
  })
}

export function createDictType(body: Record<string, unknown>, transport: Transport = {}) {
  return request<SnowflakeId>('/system/dict/types', { method: 'POST', body, ...transport })
}

export function updateDictType(
  id: SnowflakeId,
  body: Record<string, unknown>,
  transport: Transport = {},
) {
  return request<void>(`/system/dict/types/${id}`, { method: 'PUT', body, ...transport })
}

export function deleteDictType(id: SnowflakeId, transport: Transport = {}) {
  return request<void>(`/system/dict/types/${id}`, { method: 'DELETE', ...transport })
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
