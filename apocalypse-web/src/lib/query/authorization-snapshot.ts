import type { CurrentUser } from '@/lib/api/types'

/** The browser can discard an expired snapshot; it never derives new grants from the clock. */
export class ExpiredAuthorizationSnapshot extends Error {
  constructor() {
    super('授权快照已过期，正在重新校验')
    this.name = 'ExpiredAuthorizationSnapshot'
  }
}

export function authorizationDeadline(
  snapshot: Pick<CurrentUser, 'authorizationSnapshotId' | 'evaluatedAt' | 'nextTransitionAt'>,
  requestStarted: number,
  receivedAt: number,
): number {
  const evaluated = Date.parse(snapshot.evaluatedAt)
  if (!snapshot.authorizationSnapshotId?.trim() || !Number.isFinite(evaluated))
    throw new Error('授权快照格式无效，请重新加载')
  if (snapshot.nextTransitionAt === null) return Number.POSITIVE_INFINITY
  const transition = Date.parse(snapshot.nextTransitionAt)
  if (!Number.isFinite(transition)) throw new Error('授权快照有效期格式无效，请重新加载')
  // Starting the validity budget before the HTTP request subtracts the entire round-trip.
  // No local wall-clock value, response Date header, or client-side permission inference.
  const deadline = requestStarted + (transition - evaluated)
  if (deadline <= receivedAt) throw new ExpiredAuthorizationSnapshot()
  return deadline
}
