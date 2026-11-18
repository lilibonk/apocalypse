import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import type { DynaTableProps } from '@/components/dyna'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import type { AuthorizationOverview } from '../role/authorization-insight.api'
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
      allScopePerms: [],
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

  it('renders interactive __core__ module pill and clean permission inventory table without SVG diagram clutter', () => {
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

    queryClient.setQueryData(['system', 'permissions', 1, 'overview'], overviewData)

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

    expect(html).toContain(`data-module-chip="${CORE_MODULE_FILTER_VALUE}"`)
    expect(html).toContain('system:user:remove')
    expect(html).toContain('删除用户')
    expect(html).toContain('查看持有角色：删除用户')
    expect(html).not.toContain('data-testid="permission-holders-stage"')
    expect(html).not.toContain('data-slot="sticky-rail-layout"')
  })

  it('renders explicit configure action enabled with ALL scope and visibly explained disabled without it', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    const fakeController = {
      actions: {
        openEdit: vi.fn(),
        openView: vi.fn(),
      },
    } as unknown as React.ComponentProps<typeof PermissionWorkspace>['controller']

    useAuthStore.setState({
      perms: ['system:permission:list', 'system:permission:edit'],
      allScopePerms: ['system:permission:edit'],
    })
    Object.assign(useAuthStore.getInitialState(), useAuthStore.getState())
    const enabledHtml = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PermissionWorkspace
            controller={fakeController}
            collection={createBaseCollection()}
            filters={{}}
            applyFilters={vi.fn()}
            queryKey={['system', 'permissions']}
            selectedRowKey={null}
            selectRow={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(enabledHtml).toContain('aria-label="配置：删除用户"')
    expect(enabledHtml).not.toMatch(/disabled=""[^>]*aria-label="配置：删除用户"/)

    useAuthStore.setState({
      perms: ['system:permission:list'],
      allScopePerms: [],
    })
    Object.assign(useAuthStore.getInitialState(), useAuthStore.getState())
    const readonlyHtml = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PermissionWorkspace
            controller={fakeController}
            collection={createBaseCollection()}
            filters={{}}
            applyFilters={vi.fn()}
            queryKey={['system', 'permissions']}
            selectedRowKey={null}
            selectRow={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(readonlyHtml).toContain('aria-label="配置：删除用户"')
    expect(readonlyHtml).toContain('需要「权限编辑」全部门写权限')
  })
})
