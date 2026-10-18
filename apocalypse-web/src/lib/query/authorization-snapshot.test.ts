import { describe, expect, it } from 'vitest'
import { authorizationDeadline, ExpiredAuthorizationSnapshot } from './authorization-snapshot'

const snapshot = {
  authorizationSnapshotId: 'scope-revision',
  evaluatedAt: '2026-10-18T12:00:00Z',
  nextTransitionAt: '2026-10-18T12:00:01Z',
}

describe('server-derived authorization lifetime', () => {
  it('subtracts the whole request round trip using only monotonic local time', () => {
    expect(authorizationDeadline(snapshot, 100, 350)).toBe(1100)
  })
  it('rejects a response at the exact exclusive boundary before accepting it', () => {
    expect(() => authorizationDeadline(snapshot, 100, 1100)).toThrow(ExpiredAuthorizationSnapshot)
  })
  it('uses absolute offsets without interpreting local browser wall time', () => {
    expect(
      authorizationDeadline({ ...snapshot, evaluatedAt: '2026-10-18T20:00:00+08:00' }, 100, 350),
    ).toBe(1100)
  })
  it('accepts a deliberate absence of future transitions but rejects a missing contract', () => {
    expect(authorizationDeadline({ ...snapshot, nextTransitionAt: null }, 100, 900)).toBe(Infinity)
    expect(() =>
      authorizationDeadline({ ...snapshot, authorizationSnapshotId: '' }, 100, 900),
    ).toThrow('格式无效')
    expect(() =>
      authorizationDeadline({ ...snapshot, nextTransitionAt: 'not-a-date' }, 100, 900),
    ).toThrow('格式无效')
  })
})
