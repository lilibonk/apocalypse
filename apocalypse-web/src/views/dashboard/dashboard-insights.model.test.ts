import { describe, expect, it } from 'vitest'

import type { LoginLogRow } from '@/views/system/log/login/login-log.api'
import type { OperLogRow } from '@/views/system/log/oper/oper-log.api'

import {
  DASHBOARD_SAMPLE_LIMIT,
  loginTrendPath,
  operationTypeKey,
  retainedTotal,
  serverTimeCoordinate,
  summarizeLoginSample,
  summarizeOperationSample,
} from './dashboard-insights.model'

function login(id: number, loginTime: string, success = 1): LoginLogRow {
  return {
    id: `9223372036854${id}`,
    username: 'recorded-user',
    ip: null,
    userAgent: null,
    success,
    message: null,
    loginTime,
  }
}

function operation(
  id: number,
  operTime: string,
  status = 1,
  businessType: string | null = 'UPDATE',
): OperLogRow {
  return {
    id: `9223372036854${id}`,
    title: 'Recorded action',
    businessType,
    method: null,
    operName: 'recorded-user',
    operIp: null,
    operParam: null,
    operResult: null,
    status,
    errorMsg: null,
    operTime,
    costTime: null,
  }
}

describe('bounded, truthful dashboard samples', () => {
  it('selects the latest 50/100/200 observations and never promotes the sample into a total', () => {
    const rows = Array.from({ length: 250 }, (_, index) =>
      login(
        index,
        `2026-10-${String(1 + Math.floor(index / 24)).padStart(2, '0')} ${String(index % 24).padStart(2, '0')}:00:00`,
        index % 3 === 0 ? 0 : 1,
      ),
    )
    const small = summarizeLoginSample(rows, 50)
    const medium = summarizeLoginSample(rows, 100)
    const large = summarizeLoginSample(rows, 200)
    expect(small.count).toBe(50)
    expect(medium.count).toBe(100)
    expect(large.count).toBe(DASHBOARD_SAMPLE_LIMIT)
    expect(small.rows[0]).toBe(rows.at(-1))
    expect(small.coverage.first! > large.coverage.first!).toBe(true)
    expect(small.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(50)
    expect(medium.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(100)
    expect(large.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(200)
    expect(small.succeeded + small.failed).toBe(small.count)
    expect(retainedTotal(82343)).toBe(82343)
    expect(retainedTotal(undefined)).toBeNull()
  })

  it('uses naive server calendar coordinates without browser timezone conversion', () => {
    expect(serverTimeCoordinate('2026-10-18 08:12:34')).toBe(
      serverTimeCoordinate('2026-10-18T08:12:34'),
    )
    expect(
      serverTimeCoordinate('2026-10-18 08:00:00')! - serverTimeCoordinate('2026-10-18 07:00:00')!,
    ).toBe(3600000)
    expect(serverTimeCoordinate('2026-02-29 08:00:00')).toBeNull()
    expect(serverTimeCoordinate('2026-10-18 25:00:00')).toBeNull()
    expect(serverTimeCoordinate('2026-10-18T08:00:00Z')).toBeNull()
  })

  it('keeps unknown timestamps out of chart counts and explains their absence in the model', () => {
    const result = summarizeLoginSample(
      [login(1, 'not-a-time'), login(2, '2026-10-18 09:00:00')],
      50,
    )
    expect(result.count).toBe(2)
    expect(result.coverage.invalidTimes).toBe(1)
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(1)
    expect(result.coverage.first).toBe('2026-10-18 09:00:00')
    const unavailable = summarizeLoginSample([login(1, 'not-a-time')], 50)
    expect(unavailable.buckets).toEqual([])
    expect(loginTrendPath(unavailable.buckets)).toBeNull()
  })

  it('does not invent an observation span for one timestamp or repeat short-span labels', () => {
    const point = summarizeLoginSample(
      [login(1, '2026-10-18 09:00:00'), login(2, '2026-10-18 09:00:00')],
      50,
    )
    expect(point.buckets).toEqual([
      { start: '2026-10-18 09:00:00', end: '2026-10-18 09:00:00', count: 2 },
    ])
    const short = summarizeLoginSample(
      [login(1, '2026-10-18 09:00:00'), login(2, '2026-10-18 09:00:04')],
      50,
    )
    expect(short.buckets).toHaveLength(4)
    expect(new Set(short.buckets.map((bucket) => bucket.start)).size).toBe(4)
  })

  it('keeps empty, unknown-result and 0%-success samples distinct', () => {
    const empty = summarizeOperationSample([], 50)
    expect(empty.count).toBe(0)
    expect(empty.successRate).toBeNull()
    const failed = summarizeOperationSample([operation(1, '2026-10-18 09:00:00', 0)], 50)
    expect(failed.successRate).toBe(0)
    const unknown = summarizeOperationSample([operation(1, '2026-10-18 09:00:00', 7)], 50)
    expect(unknown.successRate).toBeNull()
    expect(unknown.unknown).toBe(1)
  })

  it('groups actual operation types, retaining custom values and missing types', () => {
    const result = summarizeOperationSample(
      [
        operation(1, '2026-10-18 09:00:00', 1, 'CUSTOM <action>'),
        operation(2, '2026-10-18 10:00:00', 0, 'UPDATE'),
        operation(3, '2026-10-18 11:00:00', 1, 'UPDATE'),
        operation(4, '2026-10-18 12:00:00', 1, null),
      ],
      50,
    )
    expect(result.successRate).toBe(75)
    expect(result.distribution).toEqual([
      { type: 'UPDATE', count: 2 },
      { type: null, count: 1 },
      { type: 'CUSTOM <action>', count: 1 },
    ])
    expect(result.distribution.reduce((sum, item) => sum + item.count, 0)).toBe(result.count)
    expect(operationTypeKey('CUSTOM <action>')).toBeNull()
    expect(operationTypeKey('GRANT')).toBe('typeGrant')
  })

  it('generates finite paths using only the actual bucket vertices', () => {
    const first = summarizeLoginSample([login(1, '2026-10-18 09:00:00')], 50)
    const second = summarizeLoginSample(
      [login(1, '2026-10-18 09:00:00'), login(2, '2026-10-18 10:00:00')],
      50,
    )
    const a = loginTrendPath(first.buckets)!
    const b = loginTrendPath(second.buckets)!
    expect(a.path.match(/[A-Z]/g)).toEqual(['M'])
    expect(b.path.match(/C/g)).toHaveLength(second.buckets.length - 1)
    expect(b.path).not.toMatch(/NaN|Infinity/)
    expect(retainedTotal(0)).toBe(0)
    expect(retainedTotal(-1)).toBeNull()
    expect(retainedTotal('200')).toBeNull()
  })

  it('passes exactly through the middle observation of a three-bucket peak', () => {
    const buckets = [0, 10, 0].map((count, index) => ({
      start: `2026-10-18 09:00:0${index}`,
      end: `2026-10-18 09:00:0${index + 1}`,
      count,
    }))
    const curve = loginTrendPath(buckets)!
    // The middle hover marker is (299,16). Resampling three buckets into twelve
    // points used to miss this actual peak and leave the marker above the curve.
    expect(curve.path).toMatch(/^M8,205 /)
    expect(curve.path).toContain(' 299,16 C')
    expect(curve.path).toMatch(/ 590,205$/)
    expect(curve.path.match(/C/g)).toHaveLength(2)
    const updated = loginTrendPath(
      buckets.map((bucket) => ({ ...bucket, count: bucket.count + 1 })),
    )!
    expect(updated.path.match(/[A-Z]/g)).toEqual(curve.path.match(/[A-Z]/g))
  })
})
