import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeMenuNode } from '@/lib/api/types'
import { AccessLifecycle } from '@/lib/query/access-lease'
import { ModuleScope } from '@/lib/query/module-scope'
import { DASHBOARD_TAB, useTabsStore } from '@/stores/tabs'
import { matchesPageScope, resolvePageComponent } from './component-map'
import { reconcileMenuAccess } from './menu-access'

const calendarMenus = [
  normalizeMenuNode({
    id: '999999999999999999',
    parentId: '0',
    menuName: '日历',
    type: 'M',
    path: 'calendar',
    component: 'calendar/index',
    moduleKey: 'calendar',
    perms: null,
    icon: null,
    sort: 0,
    children: [],
  }),
]
const enabled = ['/dashboard', '/calendar', '/system/user']
const disabled = ['/dashboard', '/system/user']

describe('menu access reconciliation after /me', () => {
  beforeEach(() => useTabsStore.setState({ tabs: [DASHBOARD_TAB], activeKey: '/dashboard' }))

  it('accepted authorization cleans scoped data; route reconciliation only closes revoked tabs', async () => {
    const client = new QueryClient()
    const retain = useTabsStore.getState().retainAllowed
    const lifecycle = new AccessLifecycle()
    lifecycle.accept(0, calendarMenus, ['read'], client)
    const lease = lifecycle.capture('calendar', ['read'])
    const key = ['module', 'calendar', lease.key, 'days']
    client
      .getQueryCache()
      .build(client, { queryKey: key, meta: { accessLease: lease } })
      .setData('day')
    client.setQueryData(['system', 'users'], 'unrelated')
    useTabsStore.getState().open({ key: '/system/user', title: '用户' })
    useTabsStore.getState().open({ key: '/calendar', title: '日历' })

    expect(reconcileMenuAccess(enabled, '/calendar/', retain)).toBe(false)
    expect(client.getQueryData(key)).toBe('day')
    await lifecycle.accept(0, [], [], client)
    expect(reconcileMenuAccess(disabled, '/calendar', retain)).toBe(true)
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey),
    ).toEqual([['system', 'users']])
    expect(useTabsStore.getState().tabs.map((t) => t.key)).toEqual(['/dashboard', '/system/user'])
    expect(useTabsStore.getState().activeKey).toBe('/dashboard')
    expect(reconcileMenuAccess(disabled, '/dashboard', retain)).toBe(false)
    // Re-enable derives permission from fresh menus; it does not restore stale cache or drafts.
    expect(reconcileMenuAccess(enabled, '/calendar', retain)).toBe(false)
    expect(client.getQueryData(key)).toBeUndefined()
    client.clear()
  })

  it('no-access direct URL redirects, but root landing and unrelated allowed routes do not', () => {
    const client = new QueryClient()
    const retain = vi.fn()
    for (const path of ['/calendar', '/calendar/managed', '/unknown']) {
      expect(reconcileMenuAccess(disabled, path, retain)).toBe(true)
    }
    for (const path of ['/', '/dashboard', '/system/user']) {
      expect(reconcileMenuAccess(disabled, path, retain)).toBe(false)
    }
    client.clear()
  })

  it('only built local components resolve; missing or remote components never load', () => {
    expect(resolvePageComponent('calendar/index')).not.toBeNull()
    for (const component of [
      null,
      'calendar/not-built',
      'https://example.com/module.js',
      '../../secret',
    ]) {
      expect(resolvePageComponent(component)).toBeNull()
    }
  })

  it('module pages must match the server moduleKey, and identical routes retain component identity', () => {
    const page = { default: () => null, queryScope: new ModuleScope('fixture') }
    expect(matchesPageScope(page, 'fixture')).toBe(true)
    expect(matchesPageScope(page, 'unknown')).toBe(false)
    expect(matchesPageScope(page, null)).toBe(false)
    expect(matchesPageScope({ default: () => null }, 'unknown')).toBe(false)
    expect(resolvePageComponent('system/user', 'unknown')).toBeNull()
    expect(resolvePageComponent('calendar/index', 'calendar')).toBe(
      resolvePageComponent('calendar/index', 'calendar'),
    )
  })
})
