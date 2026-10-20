/** Navigation context is a search hint, never a role choice or an authorization decision. */
export interface RoleMemberContext {
  kind: 'member'
  userId: string
  keyword: string
}

export function readRoleMemberContext(state: unknown): RoleMemberContext | undefined {
  if (!state || typeof state !== 'object' || !('workspaceContext' in state)) return undefined
  const context = state.workspaceContext
  if (!context || typeof context !== 'object') return undefined
  if (!('kind' in context) || context.kind !== 'member') return undefined
  if (!('userId' in context) || typeof context.userId !== 'string') return undefined
  if (!('keyword' in context) || typeof context.keyword !== 'string') return undefined
  const userId = context.userId.trim()
  const keyword = context.keyword.trim()
  if (!userId || !keyword || userId.length > 100 || keyword.length > 200) return undefined
  return { kind: 'member', userId, keyword }
}
