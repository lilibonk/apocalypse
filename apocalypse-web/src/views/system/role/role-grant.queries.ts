import { request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import type { PermissionDefinition } from '../permission/permission.types'
import type { RoleGrantsBaseline } from './role-grant.model'
import { canReadRoleWorkspace, type RolePermissionOpening } from './role-permission.model'
import { privateRoleGraphQuery } from './role-permission.queries'

export const GRANT_PAGE_SIZE = 4
type GrantOpening = Pick<RolePermissionOpening, 'openId' | 'principalEpoch'> & {
  role: { id: string }
}

export function createRoleGrantQuery(opening: GrantOpening) {
  return privateRoleGraphQuery(
    ['system', 'roles', opening.role.id, 'permissions', opening.principalEpoch, opening.openId],
    opening.principalEpoch,
    canReadRoleWorkspace,
    (transport) =>
      request<RoleGrantsBaseline>(`/system/roles/${opening.role.id}/permissions`, transport),
  )
}

export function createGrantCandidatesQuery(
  opening: GrantOpening,
  params: { page: number; keyword: string; moduleKey?: string; resource?: string },
) {
  return privateRoleGraphQuery(
    [
      'system',
      'roles',
      opening.role.id,
      'permission-candidates',
      opening.principalEpoch,
      opening.openId,
      params,
    ],
    opening.principalEpoch,
    (auth) => canReadRoleWorkspace(auth) && auth.perms.includes('system:permission:list'),
    (transport) =>
      request<PageResult<PermissionDefinition>>('/system/permissions/page', {
        ...transport,
        query: { ...params, keyword: params.keyword || undefined, size: GRANT_PAGE_SIZE },
      }),
  )
}
