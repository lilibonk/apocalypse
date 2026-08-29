/**
 * 登录日志端点（页面局部，只读）。
 * GET /system/logs/login?page&size&keyword → PageResult<LoginLogRow>（直接拼 query，无 /page 后缀）。
 * 雪花 id 在 JSON 中是 string，禁止 Number()。
 */

import { request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'

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

/** 登录日志分页查询。 */
export function pageLoginLogs(
  page: number,
  size: number,
  keyword?: string,
): Promise<PageResult<LoginLogRow>> {
  return request<PageResult<LoginLogRow>>('/system/logs/login', {
    query: { page, size, keyword: keyword || undefined },
  })
}
