import { ApiError, request } from '@/lib/api/client'
import { ROLE_GRAPH_CONFLICT_CODE, type RoleGraphTransport } from './role-graph.operations'

/** Check the complete relation baseline again before using the existing replacement write. */
export async function saveRoleMembers(
  transport: RoleGraphTransport,
  input: { roleId: string; baselineUserIds: readonly string[]; userIds: readonly string[] },
) {
  const baseline = new Set(input.baselineUserIds)
  const userIds = [...new Set(input.userIds)]
  transport.assertCurrent()
  const latest = await request<string[]>(`/system/roles/${input.roleId}/user-ids`, {
    signal: transport.signal,
    context: transport.context,
  })
  transport.assertCurrent()
  const current = new Set(latest)
  if (current.size !== baseline.size || [...baseline].some((id) => !current.has(id))) {
    throw new ApiError(ROLE_GRAPH_CONFLICT_CODE, '角色成员已被其他操作修改，请重新载入后再保存')
  }
  // Preserve IDs whose profile is not visible. This preflight is not an atomic CAS.
  await request<void>(`/system/roles/${input.roleId}/users`, {
    method: 'PUT',
    body: userIds,
    signal: transport.signal,
    context: transport.context,
  })
  transport.assertCurrent()
}
