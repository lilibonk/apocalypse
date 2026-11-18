import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { RoleNavigationTab } from './RoleNavigationTab'

vi.mock('./role-permission.queries', () => ({
  createRoleMenuDraftQuery: () => ({
    options: {
      queryKey: ['mock', 'nav-draft'],
      queryFn: () => Promise.resolve({ tree: [], menuIds: [], revision: '1' }),
    },
    filter: { queryKey: ['mock', 'nav-draft'] },
    activate: vi.fn(),
    deactivate: vi.fn(),
    disposeIfInactive: () => false,
  }),
}))

describe('RoleNavigationTab tree rendering and safety notices', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh', motionEnabled: false })
    useAuthStore.setState({
      sessionEpoch: 1,
      authorizationEpoch: 1,
      meLoaded: true,
      bootstrapped: true,
      perms: ['system:role:list', 'system:menu:list', 'system:role:edit'],
      allScopePerms: ['system:role:edit'],
    })
    Object.assign(useAuthStore.getInitialState(), useAuthStore.getState())
  })

  it('renders menu tree checkboxes and preserves unresolved IDs warning banner', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    queryClient.setQueryData(['mock', 'nav-draft'], {
      revision: '12',
      menuIds: ['m-user', 'unknown-legacy-nav'],
      tree: [
        {
          id: 'm-sys',
          parentId: '0',
          menuName: '系统管理',
          menuType: 'C',
          path: '/system',
          visible: 1,
          status: 1,
          children: [
            {
              id: 'm-user',
              parentId: 'm-sys',
              menuName: '用户管理',
              menuType: 'M',
              path: '/system/user',
              visible: 1,
              status: 1,
              children: [],
            },
          ],
        },
      ],
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RoleNavigationTab
            opening={{
              role: {
                id: 'role-1',
                roleName: 'Admin',
                roleKey: 'admin',
                status: 1,
                dataScope: 'ALL',
              },
              principalEpoch: 1,
              openId: 'nav-test',
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('系统管理')
    expect(html).toContain('用户管理')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('未解析关联 1 项')
    expect(html).toContain('unknown-legacy-nav')
  })

  it('degrades gracefully when system:menu:list permission is absent', () => {
    useAuthStore.setState({
      perms: ['system:role:list'],
      allScopePerms: [],
    })
    Object.assign(useAuthStore.getInitialState(), useAuthStore.getState())

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RoleNavigationTab
            opening={{
              role: {
                id: 'role-1',
                roleName: 'Admin',
                roleKey: 'admin',
                status: 1,
                dataScope: 'ALL',
              },
              principalEpoch: 1,
              openId: 'nav-test-no-menu-perm',
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('当前没有导航定义读取权限')
  })
})
