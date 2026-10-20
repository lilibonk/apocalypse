/** A navigation hint never contains trusted rows or grants; the destination refetches its scope. */
export function readWorkspaceContext(state: unknown, kind: 'user' | 'permission') {
  if (typeof state !== 'object' || state === null || !('workspaceContext' in state)) return
  const context = state.workspaceContext
  if (
    typeof context !== 'object' ||
    context === null ||
    !('kind' in context) ||
    context.kind !== kind
  )
    return
  const text = (name: string) => {
    const value = name in context ? (context as Record<string, unknown>)[name] : undefined
    return typeof value === 'string' && value.length <= 256 ? value : undefined
  }
  const filters: Record<string, string> = {}
  const names = kind === 'user' ? ['keyword'] : ['moduleKey', 'resource', 'keyword']
  names.forEach((name) => {
    const value = text(name)
    if (value !== undefined) filters[name] = value
  })
  const selectedRowKey = text(kind === 'user' ? 'userId' : 'permissionId')
  return { key: JSON.stringify([kind, filters, selectedRowKey]), filters, selectedRowKey }
}
