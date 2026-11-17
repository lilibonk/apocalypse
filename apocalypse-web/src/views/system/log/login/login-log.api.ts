/**
 * 登录日志端点（页面局部，只读）。
 * GET /system/logs/login?page&size&keyword&success&isoWeekday&hour&range&bucketFrom&bucketTo
 * 雪花 id 在 JSON 中是 string，禁止 Number()。
 */

import { request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import type { LogInsightRange } from '@/views/system/log/log-insight.api'

/** 登录日志行（对应后端 LoginLogResp）。 */
export type LoginLogRow = {
  id: string
  username: string
  ip: string | null
  userAgent: string | null
  /** 1 成功 / 0 失败（字典 sys_common_status）。 */
  success: number
  message: string | null
  loginTime: string
}

export interface LoginStreamFilter {
  keyword?: string
  success?: 0 | 1
  isoWeekday?: number
  hour?: number
  range?: LogInsightRange
  bucketFrom?: string
  bucketTo?: string
}

/** 登录日志分页查询（支持热力格、趋势时间桶与成功/失败联动下钻）。 */
export function pageLoginLogs(
  page: number,
  size: number,
  filterOrKeyword?: string | LoginStreamFilter,
  signal?: AbortSignal,
): Promise<PageResult<LoginLogRow>> {
  const filter: LoginStreamFilter =
    typeof filterOrKeyword === 'string' ? { keyword: filterOrKeyword } : (filterOrKeyword ?? {})

  return request<PageResult<LoginLogRow>>('/system/logs/login', {
    query: {
      page,
      size,
      keyword: filter.keyword?.trim() || undefined,
      success: filter.success,
      isoWeekday: filter.isoWeekday,
      hour: filter.hour,
      range: filter.range,
      bucketFrom: filter.bucketFrom,
      bucketTo: filter.bucketTo,
    },
    signal,
  })
}
