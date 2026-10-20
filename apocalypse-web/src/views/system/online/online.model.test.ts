import { describe, expect, it } from 'vitest'
import { groupOnlineAccounts } from './online.model'
import type { OnlineUserRow } from './online.api'

const session = (jti: string, username: string, loginTime: string): OnlineUserRow => ({
  jti,
  username,
  loginTime,
  ip: '10.0.0.1',
  userAgent: 'same-device',
})

describe('online account grouping', () => {
  it('keeps accounts separate on shared networks and devices, and orders stable session identities', () => {
    const rows = [
      session('a1', 'alice', '2026-10-20 08:00'),
      session('b1', 'bob', '2026-10-20 09:00'),
      session('a2', 'alice', '2026-10-20 10:00'),
    ]
    expect(
      groupOnlineAccounts(rows).map((account) => [
        account.username,
        account.sessions.map((row) => row.jti),
      ]),
    ).toEqual([
      ['alice', ['a2', 'a1']],
      ['bob', ['b1']],
    ])
    expect(rows.map((row) => row.jti)).toEqual(['a1', 'b1', 'a2'])
  })

  it('drops only vanished sessions and does not merge case-distinct account names', () => {
    const rows = [
      session('a1', 'alice', '2026-10-20 08:00'),
      session('a2', 'Alice', '2026-10-20 09:00'),
    ]
    expect(groupOnlineAccounts(rows)).toHaveLength(2)
    expect(groupOnlineAccounts(rows.slice(1))).toEqual([{ username: 'Alice', sessions: [rows[1]] }])
  })
})
