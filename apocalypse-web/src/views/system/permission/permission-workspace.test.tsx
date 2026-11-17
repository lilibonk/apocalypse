import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import type { DynaTableProps } from '@/components/dyna'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import type { AuthorizationOverview, PermissionHolders } from '../role/authorization-insight.api'
import { CORE_MODULE_FILTER_VALUE, PermissionWorkspace } from './PermissionWorkspace'

function createBaseCollection(): DynaTableProps {
  return {
    columns: [
      { key: 'name', title: '名称' },
      { key: 'code', title: '权限标识' },
    ],
    rows: [
      {
        id: 'p-user-remove',
        name: '删除用户',
        code: 'system:user:remove',
        moduleKey: null,
        resource: 'user',
        action: 'remove',
        status: 1,
        lifecycle: 'ACTIVE',
        registered: true,
        referenceRoleCount: 2,
        version: 3,
        supportedScopeOverrides: ['ALL', 'DEPT_AND_CHILDREN', 'DEPT'],
        declarationSource: 'io.apocalypse.system.user.SystemUserPermissionRegistrar',
        description: '逻辑删除可见范围内的用户账号',
      },
    ],
    rowKey: 'id',
    loading: false,
    page: 1,
    size: 10,
    total: 1,
    onPageChange: vi.fn(),
  }
}

describe('PermissionWorkspace', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh', motionEnabled: false })
    useAuthStore.setState({
      meLoaded: true,
      bootstrapped: true,
      authorizationSnapshotId: 'test-snapshot',
      authorizationDeadline: Number.POSITIVE_INFINITY,
      perms: ['system:permission:list', 'system:role:list', 'system:user:list'],
      authorizationEpoch: 1,
      menus: [
        {
          id: 'm-role',
          parentId: '0',
          menuName: '角色管理',
          menuType: 'M',
          path: '/system/role',
          component: 'system/role',
          perms: null,
          moduleKey: null,
          icon: null,
          sort: 1,
          children: [],
        },
        {
          id: 'm-user',
          parentId: '0',
          menuName: '用户管理',
          menuType: 'M',
          path: '/system/user',
          component: 'system/user',
          perms: null,
          moduleKey: null,
          icon: null,
          sort: 2,
          children: [],
        },
      ],
    })
    Object.assign(useAuthStore.getInitialState(), useAuthStore.getState())
  })

  it('renders interactive __core__ module pill and live permission holders with Role & User EntityPills', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })

    const overviewData: AuthorizationOverview = {
      evaluatedAt: '2026-10-18T12:00:00Z',
      roleCount: 2,
      enabledRoleCount: 2,
      idleRoleCount: 0,
      idleRoles: [],
      userCount: 1,
      usersVisible: true,
      usersWithoutRolesCount: 0,
      usersWithoutRoles: [],
      permissionCount: 30,
      permissionModules: [
        { key: null, enabled: true, count: 24 },
        { key: 'calendar', enabled: true, count: 6 },
      ],
      navigationCount: 2,
      unassignedNavigationCount: 0,
      unassignedNavigation: [],
      roleScopeDistribution: [],
    }

    const holdersData: PermissionHolders = {
      evaluatedAt: '2026-10-18T12:00:00Z',
      permissionId: 'p-user-remove',
      code: 'system:user:remove',
      name: '删除用户',
      moduleKey: null,
      status: 1,
      lifecycle: 'ACTIVE',
      moduleEnabled: true,
      membersVisible: true,
      outOfScopeVisible: false,
      activeRoleCount: 1,
      coveredVisibleUserCount: 1,
      roles: [
        {
          roleId: 'r-sec',
          roleName: '安全管理员',
          roleKey: 'security_admin',
          roleStatus: 1,
          roleDataScope: 'ALL',
          enabled: true,
          scopeOverride: 'DEPT_AND_CHILDREN',
          effectiveScope: 'DEPT_AND_CHILDREN',
          validFrom: '2026-10-01T00:00:00Z',
          validUntil: '2026-12-31T23:59:59Z',
          state: 'ACTIVE',
          visibleMemberCount: 1,
          outOfScopeMemberCount: 0,
          members: [{ id: '101', username: 'alice', nickname: 'Alice Chen' }],
        },
      ],
    }

    queryClient.setQueryData(['system', 'permissions', 1, 'overview'], overviewData)
    queryClient.setQueryData(['system', 'permissions', 'holders', 'p-user-remove', 1], holdersData)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PermissionWorkspace
            collection={createBaseCollection()}
            filters={{ moduleKey: CORE_MODULE_FILTER_VALUE }}
            applyFilters={vi.fn()}
            queryKey={['system', 'permissions']}
            selectedRowKey="p-user-remove"
            selectRow={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('data-slot="sticky-rail-layout"')
    expect(html).toContain('data-rail-width="locator"')
    expect(html).toContain(`data-module-chip="${CORE_MODULE_FILTER_VALUE}"`)
    expect(html).toContain('data-slot="entity-peek-link"')
    expect(html).toContain('data-testid="permission-holders-stage"')
    expect(html).toContain('data-entity-kind="role"')
    expect(html).toContain('data-entity-id="r-sec"')
    expect(html).toContain('安全管理员')
    expect(html).toContain('data-entity-kind="user"')
    expect(html).toContain('data-entity-id="101"')
    expect(html).toContain('Alice Chen')
    expect(html).not.toContain('已登记的业务动作；目录定义与角色授权分别管理。')
  })
})
