import type { RolePermissionTarget } from './role-permission.model'
import type { RoleGraphSaveInput } from './role-graph.operations'

export type RoleGraphCommand =
  | { id: string; kind: 'create' }
  | { id: string; kind: 'edit' | 'toggle' | 'delete'; role: RolePermissionTarget }

export function roleGraphCommandPerm(command: RoleGraphCommand): string {
  return command.kind === 'create'
    ? 'system:role:add'
    : command.kind === 'delete'
      ? 'system:role:remove'
      : 'system:role:edit'
}

/** PUT replaces these fields. Never send a projection of the graph node. */
export function roleGraphToggleBody(role: RolePermissionTarget): RoleGraphSaveInput {
  if (!hasCompleteRoleGraphRecord(role)) throw new Error('角色完整属性尚未加载')
  return {
    roleName: role.roleName,
    roleKey: role.roleKey,
    sort: role.sort,
    status: role.status === 1 ? 0 : 1,
    remark: role.remark,
    dataScope: role.dataScope,
    expectedAuthorizationRevision: role.authorizationRevision,
  }
}

export function hasCompleteRoleGraphRecord(role: RolePermissionTarget): boolean {
  return (
    Object.hasOwn(role, 'sort') &&
    Object.hasOwn(role, 'remark') &&
    typeof role.authorizationRevision === 'string'
  )
}

export function roleGraphFormBody(
  body: Record<string, unknown>,
  mode: 'create' | 'edit',
  authorizationRevision?: string,
): RoleGraphSaveInput {
  if (mode === 'edit' && body.status !== 0 && body.status !== 1)
    throw new Error('角色状态尚未完整加载')
  const revision =
    typeof body.expectedAuthorizationRevision === 'string'
      ? body.expectedAuthorizationRevision
      : authorizationRevision
  if (mode === 'edit' && !revision) throw new Error('角色授权版本未完整加载')
  return {
    roleName: String(body.roleName ?? ''),
    roleKey: String(body.roleKey ?? ''),
    ...(typeof body.sort === 'number' ? { sort: body.sort } : {}),
    ...(typeof body.status === 'number' ? { status: body.status } : {}),
    ...(typeof body.remark === 'string' ? { remark: body.remark } : {}),
    ...(typeof body.dataScope === 'string' ? { dataScope: body.dataScope } : {}),
    ...(mode === 'edit'
      ? {
          sort: typeof body.sort === 'number' ? body.sort : null,
          status: body.status as number,
          remark: typeof body.remark === 'string' ? body.remark : null,
          expectedAuthorizationRevision: revision,
        }
      : {}),
  }
}
