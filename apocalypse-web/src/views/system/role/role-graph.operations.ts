import type { QueryClient } from '@tanstack/react-query'
import { CanceledError } from 'axios'

import { ApiError, captureRequestContext, request, type RequestOptions } from '@/lib/api/client'
import type { RequestContext } from '@/lib/query/access-lease'
import { isAuthorizationCurrent, useAuthStore } from '@/stores/auth'

export interface RoleGraphTransport {
  signal: AbortSignal
  context: RequestContext
  assertCurrent: () => void
}

export interface RoleGraphSaveInput {
  roleName: string
  roleKey: string
  sort?: number | null
  status?: number | null
  remark?: string | null
  dataScope?: string | null
  expectedAuthorizationRevision?: string
}

/** Server compare-and-swap conflict, separate from endpoint authorization failures. */
export const ROLE_GRAPH_CONFLICT_CODE = 40900

export function isRoleGraphConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === ROLE_GRAPH_CONFLICT_CODE
}

async function guardedRequest<Data>(
  transport: RoleGraphTransport,
  path: string,
  options: Omit<RequestOptions, 'signal' | 'context'> = {},
): Promise<Data> {
  transport.assertCurrent()
  const data = await request<Data>(path, {
    ...options,
    signal: transport.signal,
    context: transport.context,
  })
  transport.assertCurrent()
  return data
}

export function createRole(transport: RoleGraphTransport, body: RoleGraphSaveInput) {
  return guardedRequest<string>(transport, '/system/roles', { method: 'POST', body: { ...body } })
}

/** RoleSaveReq replaces ordinary fields, so callers must preserve the complete accepted row. */
export async function updateRole(
  transport: RoleGraphTransport,
  input: { roleId: string; body: RoleGraphSaveInput },
) {
  if (
    ['sort', 'status', 'remark'].some(
      (key) => input.body[key as keyof RoleGraphSaveInput] === undefined,
    ) ||
    typeof input.body.expectedAuthorizationRevision !== 'string'
  ) {
    throw new ApiError(-1, '角色资料未完整加载，请刷新后再编辑')
  }
  return guardedRequest<void>(transport, `/system/roles/${input.roleId}`, {
    method: 'PUT',
    body: { ...input.body },
  })
}

export function deleteRole(transport: RoleGraphTransport, roleId: string) {
  return guardedRequest<void>(transport, `/system/roles/${roleId}`, { method: 'DELETE' })
}

/**
 * Submit touched navigation identities with the accepted server revision.
 * Unknown, unmodified identities are preserved by the server delta contract.
 */
export async function saveRoleMenus(
  transport: RoleGraphTransport,
  input: {
    roleId: string
    expectedRevision: string
    baselineMenuIds: readonly string[]
    menuIds: readonly string[]
  },
) {
  const baseline = new Set(input.baselineMenuIds)
  const selected = new Set(input.menuIds)
  await guardedRequest<void>(transport, `/system/roles/${input.roleId}/navigation`, {
    method: 'PUT',
    body: {
      expectedRevision: input.expectedRevision,
      addIds: [...selected].filter((id) => !baseline.has(id)),
      removeIds: [...baseline].filter((id) => !selected.has(id)),
    },
  })
}

/** Both page languages consume these existing endpoint caches. */
export async function invalidateRoleGraphQueries(client: QueryClient, roleId?: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['dyna', '/system/roles', 'system-role'] }),
    client.invalidateQueries({ queryKey: ['system', 'roles', 'permission-graph-choices'] }),
    ...(roleId ? [client.invalidateQueries({ queryKey: ['system', 'roles', roleId] })] : []),
  ])
}

/**
 * Captured write lifetime for the core System domain. Permission loss or refresh permanently
 * cancels this invocation, even if an equivalent grant is restored before React renders again.
 */
export function captureRoleGraphOperation(
  requiredPerms: readonly string[],
  isLocalCurrent: () => boolean,
  requiredAllScopePerms: readonly string[] = [],
) {
  const principal = captureRequestContext()
  const authorizationEpoch = useAuthStore.getState().authorizationEpoch
  const permissions = [...new Set(requiredPerms)]
  const controller = new AbortController()
  let revoked = false
  let finished = false
  let unsubscribe = () => {}
  const isCurrent = () => {
    const auth = useAuthStore.getState()
    if (
      revoked ||
      finished ||
      controller.signal.aborted ||
      !isLocalCurrent() ||
      auth.sessionEpoch !== principal.principalEpoch ||
      !auth.meLoaded ||
      !isAuthorizationCurrent(authorizationEpoch) ||
      !requiredAllScopePerms.every((permission) => auth.allScopePerms.includes(permission)) ||
      !permissions.every((permission) => auth.perms.includes(permission))
    )
      return false
    try {
      principal.assertCurrent()
      return true
    } catch {
      return false
    }
  }
  const assertCurrent = () => {
    if (!isCurrent()) throw new CanceledError('Role operation context changed')
  }
  const cancel = () => {
    revoked = true
    controller.abort()
    unsubscribe()
  }
  const finish = () => {
    finished = true
    unsubscribe()
  }
  assertCurrent()
  unsubscribe = useAuthStore.subscribe(() => {
    if (!isCurrent()) cancel()
  })
  // A write uses one captured principal and retains the existing client's 401 handling.
  const context: RequestContext = { ...principal, assertCurrent }
  const transport: RoleGraphTransport = { signal: controller.signal, context, assertCurrent }
  return { transport, isCurrent, cancel, finish }
}
