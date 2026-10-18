import { ApiError, captureRequestContext, request } from '@/lib/api/client'

/** Complete unfiltered assignment IDs. A scoped user page is never a replacement baseline. */
export async function loadAssignedUserIds(roleId: string, signal: AbortSignal): Promise<string[]> {
  const context = captureRequestContext()
  signal.throwIfAborted()
  context.assertCurrent()
  const ids = await request<unknown>(`/system/roles/${roleId}/user-ids`, { signal, context })
  signal.throwIfAborted()
  context.assertCurrent()
  if (
    !Array.isArray(ids) ||
    ids.some((id) => typeof id !== 'string' || !id) ||
    new Set(ids).size !== ids.length
  )
    throw new ApiError(-1, '已分配用户未完整加载，请重试后再保存')
  return ids as string[]
}
