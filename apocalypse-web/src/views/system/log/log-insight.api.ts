/**
 * 日志周期统计与热力图端点（服务端全量聚合，只读）。
 * - GET /system/logs/login/insights?range=DAY|WEEK|MONTH（system:log:login）
 * - GET /system/logs/login/heatmap?range=WEEK|MONTH（system:log:login）
 * - GET /system/logs/oper/insights?range=DAY|WEEK|MONTH（system:log:oper）
 * 时间为日志记录时区（zone / utcOffset）的本地时间字符串 `yyyy-MM-dd HH:mm:ss`，不按浏览器时区换算；
 * 窗口为半开区间 [from, to)，空桶表示“记录为零”。计数为数值（原生 long）。
 */

import { request } from '@/lib/api/client'

export type LogInsightRange = 'DAY' | 'WEEK' | 'MONTH'
export const logInsightRanges: readonly LogInsightRange[] = ['DAY', 'WEEK', 'MONTH']

export interface LogBucket {
  start: string
  total: number
  succeeded: number
  failed: number
}

interface InsightWindow {
  range: LogInsightRange
  bucketUnit: 'HOURS' | 'DAYS'
  zone: string
  utcOffset: string
  from: string
  to: string
  retentionStart: string
  previousCovered: boolean
  previousTotal: number
  buckets: LogBucket[]
}

export interface LoginInsights extends InsightWindow {
  total: number
  succeeded: number
  failed: number
  distinctUsers: number
  distinctIps: number
  peak: number
  average: number
}

export interface OperTypeCount {
  type: string | null
  count: number
}

export interface OperInsights extends InsightWindow {
  total: number
  succeeded: number
  failed: number
  unknown: number
  successRate: number | null
  byBusinessType: OperTypeCount[]
}

export interface LoginHeatmapCell {
  /** 1=周一 … 7=周日。 */
  isoWeekday: number
  hour: number
  total: number
  failed: number
  /** 该格在有效窗口内出现的小时数；0 表示未覆盖。 */
  slots: number
}

export interface LoginHeatmap {
  range: Exclude<LogInsightRange, 'DAY'>
  zone: string
  utcOffset: string
  from: string
  to: string
  coveredFrom: string
  retentionStart: string
  total: number
  failed: number
  maxCell: number
  cells: LoginHeatmapCell[]
}

export function getLoginInsights(range: LogInsightRange, signal?: AbortSignal) {
  return request<LoginInsights>('/system/logs/login/insights', { query: { range }, signal })
}

export function getOperInsights(range: LogInsightRange, signal?: AbortSignal) {
  return request<OperInsights>('/system/logs/oper/insights', { query: { range }, signal })
}

export function getLoginHeatmap(range: Exclude<LogInsightRange, 'DAY'>, signal?: AbortSignal) {
  return request<LoginHeatmap>('/system/logs/login/heatmap', { query: { range }, signal })
}
