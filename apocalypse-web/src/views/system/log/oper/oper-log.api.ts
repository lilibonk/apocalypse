/**
 * 操作日志端点（页面局部，只读）。
 * GET /system/logs/oper?page&size&keyword → PageResult<OperLogRow>（直接拼 query，无 /page 后缀）。
 * 雪花 id 在 JSON 中是 string，禁止 Number()。
 */

import { request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'

/** 操作日志行（对应后端 OperLogResp）。 */
export type OperLogRow = {
  id: string
  /** 操作模块（@OperLog title）。 */
  title: string | null
  /** 操作类型（@OperLog businessType，如 FORCE / GRANT）。 */
  businessType: string | null
  /** 请求方法（Java 方法签名）。 */
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

/** 操作日志分页查询。 */
export function pageOperLogs(
  page: number,
  size: number,
  keyword?: string,
): Promise<PageResult<OperLogRow>> {
  return request<PageResult<OperLogRow>>('/system/logs/oper', {
    query: { page, size, keyword: keyword || undefined },
  })
}
