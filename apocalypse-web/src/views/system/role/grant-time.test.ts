import { afterEach, describe, expect, it } from 'vitest'
import { grantInstantToWallTime, grantWallTimeToInstant } from './grant-time'
const originalZone = process.env.TZ
afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ
  else process.env.TZ = originalZone
})
describe('grant time zone boundary', () => {
  it('serializes an explicit UTC wall time and clears an open bound', () => {
    expect(grantWallTimeToInstant('2026-10-18T08:30', 'UTC')).toBe('2026-10-18T08:30:00.000Z')
    expect(grantWallTimeToInstant('', 'UTC')).toBeNull()
    expect(grantInstantToWallTime('2026-10-18T16:30:00+08:00', 'UTC')).toBe('2026-10-18T08:30')
  })
  it.each(['2026-02-30T08:30', '2026-13-01T08:30', '2026-10-18T25:30', 'not a date'])(
    'rejects normalized or invalid calendar input %s',
    (value) => {
      expect(() => grantWallTimeToInstant(value, 'UTC')).toThrow('invalid')
    },
  )
  it('explicitly converts the local wall clock to UTC', () => {
    process.env.TZ = 'Asia/Shanghai'
    expect(grantWallTimeToInstant('2026-10-18T08:30', 'local')).toBe('2026-10-18T00:30:00.000Z')
    expect(grantInstantToWallTime('2026-10-18T00:30:00Z', 'local')).toBe('2026-10-18T08:30')
  })
  it('rejects a nonexistent spring clock time and ambiguous repeated autumn time', () => {
    process.env.TZ = 'America/New_York'
    expect(() => grantWallTimeToInstant('2026-03-08T02:30', 'local')).toThrow('invalid')
    expect(() => grantWallTimeToInstant('2026-11-01T01:30', 'local')).toThrow('ambiguous')
    expect(grantWallTimeToInstant('2026-11-01T06:30', 'UTC')).toBe('2026-11-01T06:30:00.000Z')
  })
})
