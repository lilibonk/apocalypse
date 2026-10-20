import type { OnlineUserRow } from './online.api'

export interface OnlineAccount {
  username: string
  sessions: OnlineUserRow[]
}

/** The endpoint exposes username as account identity; IP and user agent identify no account. */
export function groupOnlineAccounts(rows: readonly OnlineUserRow[]): OnlineAccount[] {
  const groups = new Map<string, OnlineUserRow[]>()
  for (const row of rows) {
    const sessions = groups.get(row.username) ?? []
    sessions.push(row)
    groups.set(row.username, sessions)
  }
  return [...groups]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([username, sessions]) => ({
      username,
      sessions: sessions.sort(
        (left, right) =>
          right.loginTime.localeCompare(left.loginTime) || left.jti.localeCompare(right.jti),
      ),
    }))
}
