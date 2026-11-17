import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { EntityPill, LivingContextBar } from '../index'

describe('LivingContextBar top-anchored flow primitive', () => {
  beforeEach(() => {
    Object.assign(useAuthStore.getInitialState(), {
      menus: [
        {
          id: '10',
          parentId: '0',
          menuName: '系统管理',
          menuType: 'C',
          path: '/system',
          component: null,
          perms: null,
          icon: null,
          moduleKey: null,
          sort: 1,
          children: [
            {
              id: '101',
              parentId: '10',
              menuName: '用户管理',
              menuType: 'M',
              path: 'user',
              component: 'system/user',
              perms: null,
              icon: null,
              moduleKey: null,
              sort: 1,
              children: [],
            },
            {
              id: '102',
              parentId: '10',
              menuName: '角色管理',
              menuType: 'M',
              path: 'role',
              component: 'system/role',
              perms: null,
              icon: null,
              moduleKey: null,
              sort: 2,
              children: [],
            },
          ],
        },
      ],
    })
    useAuthStore.setState(useAuthStore.getInitialState())
  })

  it('renders nothing when source, children, and actions are all empty', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LivingContextBar>{null}</LivingContextBar>
      </MemoryRouter>,
    )
    expect(html).toBe('')
  })

  it('renders source return pill, separator, title, compact entity pills, and right actions', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/system/role']}>
        <LivingContextBar
          source={{ kind: 'user', id: '1', label: '周明远', path: '/system/user' }}
          title="关联脉络"
          actions={<span data-testid="context-action">实时联动</span>}
        >
          <EntityPill kind="user" id="2" label="林晓" sublabel="平台研发部" />
          <EntityPill kind="dept" id="200" label="平台研发部" />
        </LivingContextBar>
      </MemoryRouter>,
    )

    expect(html).toContain('role="navigation"')
    expect(html).toContain('data-slot="living-context-bar"')
    expect(html).toContain('data-slot="entity-return-pill"')
    expect(html).toContain('返回 · 周明远')
    expect(html).toContain('data-slot="living-context-bar-title"')
    expect(html).toContain('关联脉络')
    expect(html).toContain('data-entity-kind="user"')
    expect(html).toContain('h-6 px-2 text-xs')
    expect(html).toContain('data-testid="context-action"')
  })
})
