import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import {
  buildEntityRouteTarget,
  buildEntitySearchParams,
  EntityPill,
  EntityReturnPill,
  readEntityIntent,
  useEntityIntent,
} from '../index'

function IntentEcho() {
  const { intent } = useEntityIntent()
  const location = useLocation()
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="intent-kind">{intent?.kind ?? 'none'}</span>
      <span data-testid="intent-id">{intent?.id ?? 'none'}</span>
      <span data-testid="intent-relation">{intent?.relation ?? 'none'}</span>
      <span data-testid="intent-pulse">{String(intent?.triggerPulse ?? false)}</span>
      {intent?.source && <EntityReturnPill source={intent.source} />}
    </div>
  )
}

describe('Cross-Page EntityPill & Dual-Track EntityRouteIntent Protocol', () => {
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

  it('encodes and decodes EntityRouteIntent across URL SearchParams and History State', () => {
    const target = buildEntityRouteTarget('/system/role', {
      kind: 'role',
      id: '1001',
      label: '超级管理员',
      relation: 'permissions',
      focusTargetId: 'system:user:remove',
      source: { kind: 'user', id: '1', label: '周明远' },
    })

    expect(target.pathname).toBe('/system/role')
    const params = buildEntitySearchParams(target.state.entityIntent)
    expect(params.get('focusId')).toBe('1001')
    expect(params.get('roleId')).toBe('1001')
    expect(params.get('relation')).toBe('permissions')
    expect(params.get('focus')).toBe('system:user:remove')

    const parsed = readEntityIntent(params, target.state, 'role')
    expect(parsed).toMatchObject({
      kind: 'role',
      id: '1001',
      relation: 'permissions',
      focusTargetId: 'system:user:remove',
      triggerPulse: true,
      source: { kind: 'user', id: '1', label: '周明远' },
    })
  })

  it('degrades EntityPill to a non-interactive badge when the target route is not in authorized menus', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <EntityPill kind="dept" id="200" label="平台架构部" sublabel="组织" />
      </MemoryRouter>,
    )

    // 'system/dept' is not in the mocked menus above, so it must render a non-clickable span
    expect(html).toContain('<span data-slot="entity-pill"')
    expect(html).toContain('data-interactive="false"')
    expect(html).toContain('平台架构部')
  })

  it('renders an interactive button for an authorized route and resolves useEntityIntent on target route', () => {
    const pillHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/system/user']}>
        <EntityPill
          kind="role"
          id="2"
          label="安全审计员"
          sublabel="auditor"
          relation="members"
          source={{ kind: 'user', id: '99', label: '林晓' }}
        />
      </MemoryRouter>,
    )

    expect(pillHtml).toContain('<button type="button" data-slot="entity-pill"')
    expect(pillHtml).toContain('data-interactive="true"')
    expect(pillHtml).toContain('安全审计员')

    const target = buildEntityRouteTarget('/system/role', {
      kind: 'role',
      id: '2',
      label: '安全审计员',
      relation: 'members',
      source: { kind: 'user', id: '99', label: '林晓' },
    })

    const targetHtml = renderToStaticMarkup(
      <MemoryRouter
        initialEntries={[
          {
            pathname: target.pathname,
            search: target.search,
            state: target.state,
          },
        ]}
      >
        <Routes>
          <Route path="/system/role" element={<IntentEcho />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(targetHtml).toContain('<span data-testid="path">/system/role</span>')
    expect(targetHtml).toContain('<span data-testid="intent-kind">role</span>')
    expect(targetHtml).toContain('<span data-testid="intent-id">2</span>')
    expect(targetHtml).toContain('<span data-testid="intent-relation">members</span>')
    expect(targetHtml).toContain('<span data-testid="intent-pulse">true</span>')
    expect(targetHtml).toContain('data-slot="entity-return-pill"')
    expect(targetHtml).toContain('林晓')
  })
})
