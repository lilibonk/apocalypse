import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { MenuTreeTable } from './MenuTreeTable'
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

describe('MenuTreeTable unified menu management', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh', motionEnabled: false })
    useAuthStore.setState({
      meLoaded: true,
      bootstrapped: true,
      sessionEpoch: 1,
      authorizationEpoch: 1,
      perms: ['system:menu:list', 'system:menu:add', 'system:menu:edit', 'system:menu:remove'],
      allScopePerms: ['system:menu:add', 'system:menu:edit', 'system:menu:remove'],
      menus: [],
    })
    Object.assign(useAuthStore.getInitialState(), useAuthStore.getState())
  })

  it('renders 5-column expandable MenuTreeTable without preview clutter or cross-page jumps', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    const tableHtml = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
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
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(tableHtml).toContain('菜单层级')
    expect(tableHtml).toContain('路由定义')
    expect(tableHtml).toContain('显示与状态')
    expect(tableHtml).toContain('用户管理')
    expect(tableHtml).toContain('/system/user')
    expect(tableHtml).not.toContain('menu-live-preview')
    expect(tableHtml).not.toContain('角色导航分配')
    expect(tableHtml).toContain('下一页')
  })

  it('slices rows by page and renders ancestor trail when parent falls on an earlier page', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
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
              page={2}
              pageSize={1}
              onPageChange={vi.fn()}
            />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(html).toContain('用户管理')
    expect(html).toContain('data-slot="menu-page-ancestor-trail"')
    expect(html).toContain('2 / 2')
    expect(html).not.toContain('id="menu-row-m-sys"')
  })
})
