import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { NODE_WIDTH, chartGeometry } from './dept-chart.model'
import { DeptOrgChart } from './DeptOrgChart'
import type { DeptTreeNode } from './types'

const sampleTree: DeptTreeNode[] = [
  {
    id: 'd-root',
    parentId: '0',
    deptName: 'Apocalypse 集团总部',
    leader: 'Alice Chen',
    phone: '13800000001',
    sort: 1,
    status: 1,
    remark: '集团总部节点',
    children: [
      {
        id: 'd-rd',
        parentId: 'd-root',
        deptName: '平台核心研发部',
        leader: 'Bob Li',
        phone: '13800000002',
        sort: 1,
        status: 1,
        remark: null,
        children: [
          {
            id: 'd-iam',
            parentId: 'd-rd',
            deptName: 'IAM 与安全架构组',
            leader: 'Carol Wu',
            phone: null,
            sort: 1,
            status: 1,
            remark: null,
            children: [],
          },
        ],
      },
    ],
  },
]

describe('DeptOrgChart V2 topology stage', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh', motionEnabled: false })
    useAuthStore.setState({
      meLoaded: true,
      bootstrapped: true,
      sessionEpoch: 1,
      authorizationEpoch: 1,
      perms: ['system:dept:list', 'system:user:list'],
      menus: [
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

  it('uses widened node cards (240px), mounts LivingContextBar in right-inspector, and removes bottom-left HUD', () => {
    expect(NODE_WIDTH).toBeGreaterThanOrEqual(236)
    expect(chartGeometry.nodeWidth).toBe(NODE_WIDTH)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    queryClient.setQueryData(['system', 'depts', 'members', 1, 'd-iam', false, 1], {
      list: [
        {
          id: 'u-1',
          username: 'carol',
          nickname: 'Carol Wu',
          status: 1,
          deptName: 'IAM 与安全架构组',
        },
      ],
      total: 1,
      page: 1,
      size: 20,
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/system/dept?deptId=d-iam']}>
          <DeptOrgChart
            tree={sampleTree}
            onCreateChild={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('Apocalypse 集团总部')
    expect(html).toContain('平台核心研发部')
    expect(html).toContain('IAM 与安全架构组')
    expect(html).toContain('data-slot="right-inspector"')
    expect(html).toContain('data-slot="living-context-bar"')
    expect(html).toContain('data-entity-kind="dept"')
    expect(html).toContain('data-entity-kind="user"')
    expect(html).not.toContain('data-slot="bottom-left"')
  })
})
