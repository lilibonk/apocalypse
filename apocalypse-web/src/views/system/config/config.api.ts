/**
 * 参数值工作区端点（页面局部）。
 * - GET /system/configs/page?page&size&keyword（system:config:list），行含乐观锁 version
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
