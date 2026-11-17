import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import type { DynaTableProps } from '@/components/dyna'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import type { OnlineUserRow } from '../online/online.api'
import type { AuthorizationOverview } from '../role/authorization-insight.api'
import { UserWorkspace } from './UserWorkspace'

function createBaseCollection(): DynaTableProps {
  return {
    columns: [
      { key: 'username', title: '用户名' },
      { key: 'nickname', title: '昵称' },
    ],
    rows: [
      {
        id: '101',
        username: 'alice',
        nickname: 'Alice Chen',
        status: 1,
        deptId: 'd-fe',
        deptName: '前端研发组',
        createTime: '2026-10-18T09:30:00',
        deptPath: [
          { id: 'd-root', deptName: '集团总部' },
          { id: 'd-rd', deptName: '研发中心' },
          { id: 'd-fe', deptName: '前端研发组' },
        ],
        roles: [
          {
            id: 'r-admin',
            roleName: '平台架构师',
            roleKey: 'platform_architect',
            status: 1,
            dataScope: 'ALL',
          },
        ],
      },
      {
        id: '102',
        username: 'bob',
        nickname: 'Bob Li',
        status: 1,
        deptId: 'd-qa',
        deptName: '质量保障组',
        createTime: '2026-10-19T10:00:00',
        deptPath: [],
        roles: [],
      },
    ],
    rowKey: 'id',
    loading: false,
    page: 1,
    size: 10,
    total: 2,
    onPageChange: vi.fn(),
  }
}

describe('UserWorkspace', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh', motionEnabled: false })
    useAuthStore.setState({
      meLoaded: true,
      bootstrapped: true,
      authorizationSnapshotId: 'test-snapshot',
      authorizationDeadline: Number.POSITIVE_INFINITY,
      perms: [
        'system:user:list',
        'system:role:list',
        'system:permission:list',
        'system:dept:list',
        'system:online:list',
        'system:log:login',
      ],
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
          id: 'm-dept',
          parentId: '0',
          menuName: '部门管理',
          menuType: 'M',
          path: '/system/dept',
          component: 'system/dept',
          perms: null,
          moduleKey: null,
          icon: null,
          sort: 2,
          children: [],
        },
        {
          id: 'm-online',
          parentId: '0',
          menuName: '在线用户',
          menuType: 'M',
          path: '/system/online',
          component: 'system/online',
          perms: null,
          moduleKey: null,
          icon: null,
          sort: 3,
          children: [],
        },
      ],
    })
    Object.assign(useAuthStore.getInitialState(), useAuthStore.getState())
  })

  it('renders StickyCompactRailLayout and the 4-section living relationship stage with EntityPills', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })

    const overviewData: AuthorizationOverview = {
      evaluatedAt: '2026-10-18T12:00:00Z',
      roleCount: 1,
      enabledRoleCount: 1,
      idleRoleCount: 0,
      idleRoles: [],
      userCount: 2,
      usersVisible: true,
      usersWithoutRolesCount: 1,
      usersWithoutRoles: [{ id: '102', username: 'bob', nickname: 'Bob Li' }],
      permissionCount: 10,
      permissionModules: [],
      navigationCount: 3,
      unassignedNavigationCount: 0,
      unassignedNavigation: [],
      roleScopeDistribution: [],
    }
    const onlineData: OnlineUserRow[] = [
      {
        jti: 'jti-alice-1',
        username: 'alice',
        ip: '10.0.0.8',
        userAgent: 'Chrome',
        loginTime: '2026-10-18T09:35:00',
      },
    ]

    queryClient.setQueryData(['system', 'users', 1, 'overview'], overviewData)
    queryClient.setQueryData(['system', 'online-users', 'user-workspace', 1], onlineData)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UserWorkspace
            collection={createBaseCollection()}
            filters={{}}
            applyFilters={vi.fn()}
            queryKey={['system', 'users']}
            selectedRowKey="101"
            selectRow={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('data-slot="sticky-rail-layout"')
    expect(html).toContain('data-rail-width="locator"')
    expect(html).toContain('data-slot="entity-peek-link"')
    expect(html).toContain('data-entity-kind="dept"')
    expect(html).toContain('集团总部 / 研发中心 / 前端研发组')
    expect(html).toContain('data-entity-kind="role"')
    expect(html).toContain('data-entity-id="r-admin"')
    expect(html).toContain('平台架构师')
    expect(html).toContain('platform_architect')
    expect(html).toContain('全部部门')
    expect(html).toContain('data-entity-kind="session"')
    expect(html).toContain('data-entity-kind="log-login"')
    expect(html).toContain('10.0.0.8')
    expect(html).not.toContain('角色分配在角色工作区管理')
  })
})
