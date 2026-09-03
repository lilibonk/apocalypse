import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeMenuNode } from '@/lib/api/types'
import { DASHBOARD_TAB, useTabsStore } from '@/stores/tabs'
import { resolvePageComponent } from './component-map'
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

  it('enabled keeps current page and data; revoked closes tabs and removes only Calendar queries', () => {
    const client = new QueryClient()
    const retain = useTabsStore.getState().retainAllowed
    const cancel = vi.spyOn(client, 'cancelQueries')
    client.setQueryData(['calendar', 'days', 'school'], 'day')
    client.setQueryData(['calendar', 'conflicts', 'school'], 'conflict')
    client.setQueryData(['system', 'users'], 'unrelated')
    useTabsStore.getState().open({ key: '/system/user', title: '用户' })
    useTabsStore.getState().open({ key: '/calendar', title: '日历' })

    expect(reconcileMenuAccess(calendarMenus, enabled, '/calendar/', client, retain)).toBe(false)
    expect(client.getQueryData(['calendar', 'days', 'school'])).toBe('day')
    expect(reconcileMenuAccess([], disabled, '/calendar', client, retain)).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey),
    ).toEqual([['system', 'users']])
    expect(useTabsStore.getState().tabs.map((t) => t.key)).toEqual(['/dashboard', '/system/user'])
    expect(useTabsStore.getState().activeKey).toBe('/dashboard')
    expect(reconcileMenuAccess([], disabled, '/dashboard', client, retain)).toBe(false)
    // Re-enable derives permission from fresh menus; it does not restore stale cache or drafts.
    expect(reconcileMenuAccess(calendarMenus, enabled, '/calendar', client, retain)).toBe(false)
    expect(client.getQueryData(['calendar', 'days', 'school'])).toBeUndefined()
    client.clear()
  })

  it('no-access direct URL redirects, but root landing and unrelated allowed routes do not', () => {
    const client = new QueryClient()
    const retain = vi.fn()
    for (const path of ['/calendar', '/calendar/managed', '/unknown']) {
      expect(reconcileMenuAccess([], disabled, path, client, retain)).toBe(true)
    }
    for (const path of ['/', '/dashboard', '/system/user']) {
      expect(reconcileMenuAccess([], disabled, path, client, retain)).toBe(false)
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
})
