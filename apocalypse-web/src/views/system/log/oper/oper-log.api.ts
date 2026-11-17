/**
 * 操作日志端点（页面局部，只读）。
 * GET /system/logs/oper?page&size&keyword&businessType&status&range&bucketFrom&bucketTo
 * 雪花 id 在 JSON 中是 string，禁止 Number()。
 */

import { request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import type { LogInsightRange } from '@/views/system/log/log-insight.api'

/** 操作日志行（对应后端 OperLogResp）。 */
export type OperLogRow = {
  id: string
  /** 操作模块（@OperLog title）。 */
  title: string | null
  /** 操作类型（@OperLog businessType，如 FORCE / GRANT）。 */
  businessType: string | null
  /** 调用方法（Java 方法签名，不是 HTTP method）。 */
  method: string | null
  operName: string | null
  operIp: string | null
  operParam: string | null
  operResult: string | null
  /** 1 成功 / 0 失败（字典 sys_common_status）。 */
  status: number
  errorMsg: string | null
  operTime: string
  /** 耗时（毫秒）。 */
  costTime: number | null
}

export interface OperStreamFilter {
  keyword?: string
  businessType?: string
  status?: 0 | 1
  range?: LogInsightRange
  bucketFrom?: string
  bucketTo?: string
}

/** 操作日志分页查询（支持按业务类型、成功/失败状态与时间窗口下钻过滤）。 */
export function pageOperLogs(
  page: number,
  size: number,
  filterOrKeyword?: string | OperStreamFilter,
  signal?: AbortSignal,
): Promise<PageResult<OperLogRow>> {
  const filter: OperStreamFilter =
    typeof filterOrKeyword === 'string' ? { keyword: filterOrKeyword } : (filterOrKeyword ?? {})

  return request<PageResult<OperLogRow>>('/system/logs/oper', {
    query: {
      page,
      size,
      keyword: filter.keyword?.trim() || undefined,
      businessType: filter.businessType || undefined,
      status: filter.status,
      range: filter.range,
      bucketFrom: filter.bucketFrom,
      bucketTo: filter.bucketTo,
    },
    signal,
  })
}
