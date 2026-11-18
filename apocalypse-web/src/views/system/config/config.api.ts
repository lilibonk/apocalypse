/**
 * 参数设置端点（页面局部）。
 * - GET /system/configs/page?page&size&keyword（system:config:list），行含乐观锁 version
 * - POST /system/configs（system:config:add）
 * - PUT /system/configs/{id}（system:config:edit，带 expectedVersion）
 * - DELETE /system/configs/{id}（system:config:remove）
 * - PUT /system/configs/values（system:config:edit）：同一事务全部成功或全部失败；任一项版本过期 → 40900
 */

import { request, type RequestOptions } from '@/lib/api/client'
import type { PageResult, SnowflakeId } from '@/lib/api/types'

export interface ConfigRow {
  id: SnowflakeId
  configKey: string
  configName: string
  configValue: string | null
  remark: string | null
  version: number
}

export interface ConfigValueItem {
  id: SnowflakeId
  expectedVersion: number
  configValue: string | null
}

export interface ConfigSaveBody {
  configKey: string
  configName: string
  configValue?: string | null
  remark?: string | null
  expectedVersion?: number
}

export function pageConfigs(
  page: number,
  size: number,
  keyword?: string,
  signal?: AbortSignal,
): Promise<PageResult<ConfigRow>> {
  return request<PageResult<ConfigRow>>('/system/configs/page', {
    query: { page, size, keyword: keyword || undefined },
    signal,
  })
}

export function createConfig(
  body: ConfigSaveBody,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<SnowflakeId> {
  return request<SnowflakeId>('/system/configs', {
    method: 'POST',
    body,
    ...transport,
  })
}

export function updateConfig(
  id: SnowflakeId,
  body: ConfigSaveBody,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/system/configs/${id}`, {
    method: 'PUT',
    body,
    ...transport,
  })
}

export function deleteConfig(
  id: SnowflakeId,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<void> {
  return request<void>(`/system/configs/${id}`, {
    method: 'DELETE',
    ...transport,
  })
}

export function saveConfigValues(
  items: ConfigValueItem[],
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<ConfigRow[]> {
  return request<ConfigRow[]>('/system/configs/values', {
    method: 'PUT',
    body: { items },
    ...transport,
  })
}

/** Existing exact-key lookup: reload only the edited parameters across paginated results. */
export function getConfigByKey(
  key: string,
  transport: Pick<RequestOptions, 'signal' | 'context'> = {},
): Promise<ConfigRow> {
  return request<ConfigRow>(`/system/configs/key/${encodeURIComponent(key)}`, transport)
}
