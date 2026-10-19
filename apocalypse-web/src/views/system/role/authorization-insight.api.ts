/**
 * 确定性授权洞察端点（只读，需 system:role:list 与 system:permission:list）。
 * - GET /system/authorization/insights/overview
 * - GET /system/authorization/insights/permission-holders?permissionId=
 * 结果是授权配置在 evaluatedAt（服务器可信时刻，RFC 3339 UTC）的状态，不代表某用户的最终有效权限。
 * 用户名单受调用者 system:user:list 数据范围约束；雪花 id 为 string。
 */

import { request } from '@/lib/api/client'
import type { SnowflakeId } from '@/lib/api/types'

export interface InsightUser {
  id: SnowflakeId
  username: string
  nickname: string | null
}

export type IdleReason = 'NO_MEMBERS' | 'NO_ACTIVE_GRANTS' | 'BOTH'

export interface IdleRole {
  roleId: SnowflakeId
  roleName: string
  roleKey: string
  status: number
  memberCount: number
  activeGrantCount: number
  reason: IdleReason
}

export interface UnassignedNavigation {
  menuId: SnowflakeId
  menuName: string
  menuType: 'C' | 'M'
  parentId: SnowflakeId
  path: string | null
  moduleKey: string | null
  moduleEnabled: boolean
}

export interface InsightCount {
  key: string | null
  count: number
  enabled: boolean
}

export interface AuthorizationOverview {
  evaluatedAt: string
  usersVisible: boolean
  userCount: number
  roleCount: number
  enabledRoleCount: number
  permissionCount: number
  navigationCount: number
  idleRoleCount: number
  idleRoles: IdleRole[]
  usersWithoutRolesCount: number
  usersWithoutRoles: InsightUser[]
  unassignedNavigationCount: number
  unassignedNavigation: UnassignedNavigation[]
  roleScopeDistribution: InsightCount[]
  permissionModules: InsightCount[]
}

export type GrantState =
  | 'ACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'PAUSED'
  | 'ROLE_DISABLED'
  | 'DEFINITION_DISABLED'
  | 'MODULE_DISABLED'

export interface PermissionHolderRole {
  roleId: SnowflakeId
  roleName: string
  roleKey: string
  roleStatus: number
  roleDataScope: string
  enabled: boolean
  scopeOverride: string
  effectiveScope: string
  validFrom: string | null
  validUntil: string | null
  state: GrantState
  visibleMemberCount: number
  outOfScopeMemberCount: number
  members: InsightUser[]
}

export interface PermissionHolders {
  evaluatedAt: string
  permissionId: SnowflakeId
  code: string
  name: string
  moduleKey: string | null
  status: number
  lifecycle: string
  moduleEnabled: boolean
  membersVisible: boolean
  outOfScopeVisible: boolean
  activeRoleCount: number
  coveredVisibleUserCount: number
  roles: PermissionHolderRole[]
}

export function getAuthorizationOverview(signal?: AbortSignal) {
  return request<AuthorizationOverview>('/system/authorization/insights/overview', { signal })
}

export function getPermissionHolders(permissionId: SnowflakeId, signal?: AbortSignal) {
  return request<PermissionHolders>('/system/authorization/insights/permission-holders', {
    query: { permissionId },
    signal,
  })
}
