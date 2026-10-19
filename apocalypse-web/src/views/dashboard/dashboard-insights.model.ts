import type { LogBucket, LogInsightRange } from '@/views/system/log/log-insight.api'

/** Activity list size per readable log source on desktop (mobile keeps its own 4-record cache). */
export const DASHBOARD_ACTIVITY_LIMIT = 6
export const dashboardRanges: readonly LogInsightRange[] = ['DAY', 'WEEK', 'MONTH']

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

/** Axis label for a bucket start in the server's recording zone: HH:00 for hours, MM-DD for days. */
export function bucketLabel(start: string, unit: 'HOURS' | 'DAYS'): string {
  const normalized = start.replace('T', ' ')
  return unit === 'HOURS' ? normalized.slice(11, 16) : normalized.slice(5, 10)
}

export interface PeriodComparison {
  /** null when the previous window is not fully retained or had no records to compare with. */
  percent: number | null
  /**
   * Set instead of percent once the total is at least double the previous one: "+1050%" reads as
   * noise on a small baseline, "11.5×" does not. One decimal below 10×, whole numbers from 10×.
   */
  multiple: number | null
  direction: 'up' | 'down' | 'same' | null
}

export function periodComparison(
  total: number,
  previousTotal: number,
  previousCovered: boolean,
): PeriodComparison {
  if (!previousCovered) return { percent: null, multiple: null, direction: null }
  if (previousTotal === 0)
    return { percent: null, multiple: null, direction: total === 0 ? 'same' : 'up' }
  const ratio = total / previousTotal
  if (ratio >= 2) {
    const multiple = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10
    return { percent: null, multiple, direction: 'up' }
  }
  const percent = Math.round((ratio - 1) * 1000) / 10
  return {
    percent: Math.abs(percent),
    multiple: null,
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'same',
  }
}

export const trendGeometry = { width: 600, height: 230, left: 8, right: 590, top: 16, bottom: 205 }

/** Every curve vertex is an observed bucket; smooth segments never overshoot its counts. */
export function trendPath(counts: readonly number[]) {
  if (counts.length === 0) return null
  const { left, right, top, bottom } = trendGeometry
  const maximum = Math.max(1, ...counts)
  const points = counts.map((count, index) => ({
    x:
      counts.length === 1
        ? trendGeometry.width / 2
        : left + ((right - left) * index) / (counts.length - 1),
    y: bottom - ((bottom - top) * count) / maximum,
  }))
  let path = `M${points[0].x},${points[0].y}`
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]
    const current = points[index]
    const step = (current.x - previous.x) / 3
    path += ` C${previous.x + step},${previous.y} ${current.x - step},${current.y} ${current.x},${current.y}`
  }
  return { path, fill: `${path} L${right},${bottom} L${left},${bottom} Z`, maximum, points }
}

export function bucketCounts(buckets: readonly LogBucket[]): number[] {
  return buckets.map((bucket) => bucket.total)
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
