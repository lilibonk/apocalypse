import type { LoginLogRow } from '@/views/system/log/login/login-log.api'
import type { OperLogRow } from '@/views/system/log/oper/oper-log.api'

/** One bounded request per readable log source. There is deliberately no pagination loop. */
export const DASHBOARD_SAMPLE_LIMIT = 200
export const dashboardSampleSizes = [50, 100, 200] as const
export type DashboardSampleSize = (typeof dashboardSampleSizes)[number]

export interface SampleCoverage {
  first: string | null
  last: string | null
  invalidTimes: number
}

export interface LoginBucket {
  start: string
  end: string
  count: number
}

export interface LoginSample {
  rows: LoginLogRow[]
  count: number
  succeeded: number
  failed: number
  coverage: SampleCoverage
  buckets: LoginBucket[]
}

export interface OperationTypeCount {
  /** Null means the source did not record a type; raw business values remain unchanged. */
  type: string | null
  count: number
}

export interface OperationSample {
  rows: OperLogRow[]
  count: number
  succeeded: number
  failed: number
  unknown: number
  successRate: number | null
  coverage: SampleCoverage
  distribution: OperationTypeCount[]
}

/** A timezone-free coordinate for server LocalDateTime, never a browser-local timestamp. */
export function serverTimeCoordinate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match.map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
    ? date.getTime()
    : null
}

function formatCoordinate(value: number): string {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ')
}

function coverage(times: string[]): SampleCoverage {
  const valid = times.flatMap((time) => {
    const coordinate = serverTimeCoordinate(time)
    return coordinate === null ? [] : [coordinate]
  })
  return {
    first: valid.length ? formatCoordinate(Math.min(...valid)) : null,
    last: valid.length ? formatCoordinate(Math.max(...valid)) : null,
    invalidTimes: times.length - valid.length,
  }
}

function recentRows<T>(
  rows: readonly T[],
  size: DashboardSampleSize,
  time: (row: T) => string,
): T[] {
  return [...rows]
    .sort((left, right) =>
      time(right).replace('T', ' ').localeCompare(time(left).replace('T', ' ')),
    )
    .slice(0, Math.min(size, DASHBOARD_SAMPLE_LIMIT))
}

/** Buckets cover only the selected records' observed span, never an assumed reporting period. */
export function summarizeLoginSample(
  rows: readonly LoginLogRow[],
  size: DashboardSampleSize,
): LoginSample {
  const selected = recentRows(rows, size, (row) => row.loginTime)
  const range = coverage(selected.map((row) => row.loginTime))
  const first = range.first === null ? null : serverTimeCoordinate(range.first)
  const last = range.last === null ? null : serverTimeCoordinate(range.last)
  const buckets: LoginBucket[] = []
  if (first !== null && last !== null) {
    // A single observed instant is one actual bucket, not an invented all-day series.
    const span = last - first
    const bucketCount = span === 0 ? 1 : Math.min(12, Math.max(1, Math.floor(span / 1000)))
    for (let index = 0; index < bucketCount; index++) {
      buckets.push({
        start: formatCoordinate(first + (span * index) / bucketCount),
        end: formatCoordinate(first + (span * (index + 1)) / bucketCount),
        count: 0,
      })
    }
    for (const row of selected) {
      const coordinate = serverTimeCoordinate(row.loginTime)
      if (coordinate === null) continue
      const index =
        span === 0
          ? 0
          : Math.min(bucketCount - 1, Math.floor(((coordinate - first) / span) * bucketCount))
      buckets[index].count++
    }
  }
  return {
    rows: selected,
    count: selected.length,
    succeeded: selected.filter((row) => row.success === 1).length,
    failed: selected.filter((row) => row.success === 0).length,
    coverage: range,
    buckets,
  }
}

export function summarizeOperationSample(
  rows: readonly OperLogRow[],
  size: DashboardSampleSize,
): OperationSample {
  const selected = recentRows(rows, size, (row) => row.operTime)
  const succeeded = selected.filter((row) => row.status === 1).length
  const failed = selected.filter((row) => row.status === 0).length
  const unknown = selected.length - succeeded - failed
  const counts = new Map<string | null, number>()
  for (const row of selected) {
    const type = row.businessType?.trim() || null
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  return {
    rows: selected,
    count: selected.length,
    succeeded,
    failed,
    unknown,
    successRate: selected.length > 0 && unknown === 0 ? (succeeded / selected.length) * 100 : null,
    coverage: coverage(selected.map((row) => row.operTime)),
    distribution: [...counts]
      .map(([type, count]) => ({ type, count }))
      .sort(
        (left, right) =>
          right.count - left.count || (left.type ?? '').localeCompare(right.type ?? ''),
      ),
  }
}

export const trendGeometry = { width: 600, height: 230, left: 8, right: 590, top: 16, bottom: 205 }

/** Every curve vertex is an observed bucket; smooth segments never overshoot its counts. */
export function loginTrendPath(buckets: readonly LoginBucket[]) {
  if (buckets.length === 0) return null
  const { left, right, top, bottom } = trendGeometry
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.count))
  const points = buckets.map((bucket, index) => ({
    x:
      buckets.length === 1
        ? trendGeometry.width / 2
        : left + ((right - left) * index) / (buckets.length - 1),
    y: bottom - ((bottom - top) * bucket.count) / maximum,
  }))
  let path = `M${points[0].x},${points[0].y}`
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]
    const current = points[index]
    const step = (current.x - previous.x) / 3
    path += ` C${previous.x + step},${previous.y} ${current.x - step},${current.y} ${current.x},${current.y}`
  }
  return { path, fill: `${path} L${right},${bottom} L${left},${bottom} Z`, maximum }
}

export function retainedTotal(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function operationTypeKey(type: string | null) {
  switch (type) {
    case 'INSERT':
      return 'typeInsert'
    case 'UPDATE':
      return 'typeUpdate'
    case 'DELETE':
      return 'typeDelete'
    case 'GRANT':
      return 'typeGrant'
    case 'FORCE':
      return 'typeForce'
    case null:
      return 'typeUnknown'
    default:
      return null
  }
}
