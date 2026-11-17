import { describe, expect, it } from 'vitest'

import {
  paginateRoleSector,
  ROLE_SECTOR_LIMIT,
  synthesizeDomains,
  synthesizeRoleTopology,
} from './RolePanorama'
import type { AuthorizationOverview } from './authorization-insight.api'

const mockOverview: AuthorizationOverview = {
  evaluatedAt: '2026-11-11T00:20:00Z',
  usersVisible: true,
  userCount: 4,
  roleCount: 3,
  enabledRoleCount: 3,
  permissionCount: 12,
  navigationCount: 10,
  idleRoleCount: 0,
  idleRoles: [],
  usersWithoutRolesCount: 1,
  usersWithoutRoles: [{ id: '9', username: 'newbie', nickname: '新入职员工' }],
  unassignedNavigationCount: 0,
  unassignedNavigation: [],
  roleScopeDistribution: [
    { key: 'ALL', count: 1, enabled: true },
    { key: 'DEPT_AND_CHILDREN', count: 2, enabled: true },
  ],
  permissionModules: [
    { key: null, count: 10, enabled: true },
    { key: 'calendar', count: 2, enabled: true },
  ],
}

describe('role stage sector pagination and 3-column business penetration topology', () => {
  it('caps each role sector page at ROLE_SECTOR_LIMIT (16) and paginates deterministically', () => {
    const roles = Array.from({ length: 42 }, (_, index) => ({
      id: String(index + 1),
      roleName: `Role ${index + 1}`,
    }))
    const page1 = paginateRoleSector(roles, 1)
    expect(page1.items).toHaveLength(ROLE_SECTOR_LIMIT)
    expect(page1.pages).toBe(3)
    expect(page1.page).toBe(1)

    const page3 = paginateRoleSector(roles, 3)
    expect(page3.items).toHaveLength(10)
    expect(page3.page).toBe(3)
  })

  it('clamps out-of-range sector page indices safely', () => {
    const roles = [{ id: '1', roleName: 'Admin' }]
    const low = paginateRoleSector(roles, 0)
    expect(low.page).toBe(1)
    expect(low.pages).toBe(1)

    const high = paginateRoleSector(roles, 99)
    expect(high.page).toBe(1)
    expect(high.items).toHaveLength(1)
  })

  it('synthesizes core and dynamic module business domains when backend businessDomains is absent', () => {
    const domains = synthesizeDomains(mockOverview)
    expect(domains.map((d) => d.domainKey)).toEqual([
      'identity_org',
      'rbac_nav',
      'runtime_config',
      'security_audit',
      'calendar',
    ])
  })

  it('synthesizes role topology nodes with GOVERN and READ domain access levels', () => {
    const domains = synthesizeDomains(mockOverview)
    const nodes = synthesizeRoleTopology(
      mockOverview,
      [
        {
          id: '1',
          roleName: '平台全局架构师',
          roleKey: 'super_admin',
          status: 1,
          dataScope: 'ALL',
        },
        {
          id: '2',
          roleName: '安全合规审计官',
          roleKey: 'sec_auditor',
          status: 1,
          dataScope: 'DEPT_AND_CHILDREN',
        },
      ],
      domains,
    )
    expect(nodes).toHaveLength(2)
    expect(nodes[0].domainAccess.some((a) => a.accessLevel === 'GOVERN')).toBe(true)
    expect(nodes[1].domainAccess.find((a) => a.domainKey === 'security_audit')?.accessLevel).toBe(
      'GOVERN',
    )
    expect(nodes[1].domainAccess.find((a) => a.domainKey === 'identity_org')?.accessLevel).toBe(
      'READ',
    )
  })
})
