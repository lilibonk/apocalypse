import { ApiError, captureRequestContext, request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'

export const GRANT_USERS_PAGE_SIZE = 200

/** Read the complete replacement baseline before exposing any editable selection. */
export async function loadAssignedUserIds(roleId: string, signal: AbortSignal): Promise<string[]> {
  const ids = new Set<string>()
  const context = captureRequestContext()
  let expectedTotal: number | undefined
  for (let page = 1; ; page += 1) {
    signal.throwIfAborted()
    context.assertCurrent()
    const result = await request<PageResult<{ id: string }>>(`/system/roles/${roleId}/users`, {
      query: { page, size: GRANT_USERS_PAGE_SIZE },
      signal,
      context,
    })
    signal.throwIfAborted()
    context.assertCurrent()
    expectedTotal ??= result.total
    if (
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      result.total !== expectedTotal ||
      result.page !== page ||
      result.size !== GRANT_USERS_PAGE_SIZE ||
      result.list.length !== Math.min(GRANT_USERS_PAGE_SIZE, expectedTotal - ids.size)
    ) {
      throw incompleteAssignments()
    }
    for (const user of result.list) {
      if (typeof user.id !== 'string' || !user.id || ids.has(user.id)) {
        throw incompleteAssignments()
      }
      ids.add(user.id)
    }
    if (ids.size === expectedTotal) return [...ids]
  }
}

function incompleteAssignments() {
  return new ApiError(-1, '已分配用户列表发生变化或未完整加载，请重试后再保存')
}
