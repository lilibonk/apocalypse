import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { MenuTreeTable } from './MenuTreeTable'
import { MenuInspector, MenuTreeWorkspace } from './MenuTreeWorkspace'
import { normalizeMenuTreeNode } from './menu.types'

const sampleTree = [
  normalizeMenuTreeNode({
    id: 'm-sys',
    parentId: '0',
    menuName: '系统管理',
    type: 'C',
    path: '/system',
    visible: 1,
    status: 1,
    sort: 1,
    children: [
      {
        id: 'm-user',
        parentId: 'm-sys',
        menuName: '用户管理',
        type: 'M',
        path: '/system/user',
        component: 'system/user',
        visible: 1,
        status: 1,
        sort: 1,
        children: [],
      },
    ],
  }),
]

describe('MenuTreeWorkspace & MenuInspector V2', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh', motionEnabled: false })
    useAuthStore.setState({
      meLoaded: true,
      bootstrapped: true,
      sessionEpoch: 1,
      authorizationEpoch: 1,
      perms: ['system:menu:list', 'system:role:list'],
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
          id: 'm-menu',
          parentId: '0',
          menuName: '菜单管理',
          menuType: 'M',
          path: '/system/menu',
          component: 'system/menu',
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

  it('mounts EntityPeekLink and live sidebar preview in MenuInspector while keeping return bar when source is present', () => {
    const childNode = sampleTree[0]!.children[0]!
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MenuInspector
          node={childNode}
          path={[sampleTree[0]!, childNode]}
          source={{ kind: 'role', id: 'r-1', label: '超级管理员' }}
          onSelect={vi.fn()}
          onCreateChild={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(html).toContain('data-slot="living-context-bar"')
    expect(html).toContain('data-slot="entity-return-pill"')
    expect(html).toContain('data-slot="entity-peek-link"')
    expect(html).toContain('data-slot="menu-live-preview"')
    expect(html).toContain('超级管理员')
    expect(html).toContain('data-entity-kind="menu"')
    expect(html).toContain('系统管理')
    expect(html).toContain('data-entity-kind="role"')
    expect(html).toContain('角色导航分配')
  })

  it('renders MenuTreeWorkspace and 5-column MenuTreeTable without redundant inner borders', () => {
    const workspaceHtml = renderToStaticMarkup(
      <MemoryRouter>
        <MenuTreeWorkspace
          tree={sampleTree}
          allTree={sampleTree}
          collapsed={new Set()}
          selectedId="m-user"
          loading={false}
          filtering={false}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onResetFilters={vi.fn()}
          onCreateChild={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(workspaceHtml).toContain('data-slot="entity-peek-link"')
    expect(workspaceHtml).toContain('data-slot="menu-live-preview"')
    expect(workspaceHtml).toContain('用户管理')

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    const tableHtml = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MenuTreeTable
            tree={sampleTree}
            isLoading={false}
            collapsed={new Set()}
            onToggle={vi.fn()}
            onSelect={vi.fn()}
            onCreateChild={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            filtering={false}
            onResetFilters={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(tableHtml).toContain('菜单层级')
    expect(tableHtml).toContain('路由定义')
    expect(tableHtml).toContain('显示与状态')
  })
})
