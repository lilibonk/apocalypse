import { describe, expect, it } from 'vitest'

import { ApiError } from '@/lib/api/client'
import type { FlatRoute } from '@/routes/menu-routes'
import type { LoginLogRow } from '@/views/system/log/login/login-log.api'
import type { OperLogRow } from '@/views/system/log/oper/oper-log.api'

import { commonTaskRoutes, readableQueryData, recentActivity } from './dashboard-model'

function route(component: string, path = `/${component}`, title = 'Renamed menu'): FlatRoute {
  return { component, path, title, icon: null, moduleKey: null }
}

describe('dashboard task identity', () => {
  it('keeps familiar tasks discoverable when labels and configured URLs change', () => {
    const user = route('/system/user/index/', '/team/accounts', 'Team accounts')
    const roles = route('system/role', '/access-policies', 'Access policies')
    const calendar = route('calendar/index')
    expect(commonTaskRoutes([calendar, roles, user])).toEqual([user, roles, calendar])
  })

  it('only uses available routes and fills remaining space with module entries', () => {
    const calendar = route('calendar/index')
    expect(commonTaskRoutes([route('dashboard'), calendar])).toEqual([calendar])
    expect(commonTaskRoutes([])).toEqual([])
  })
})

describe('dashboard protected cached content', () => {
  const data = [{ username: 'visible-before-revocation' }]

  it('hides cached data immediately when a permission is removed', () => {
    expect(readableQueryData(false, { data, error: null })).toBeUndefined()
  })

  it.each([403, 40300, 404, 40400])('hides cached data after resource denial %i', (code) => {
    expect(readableQueryData(true, { data, error: new ApiError(code, 'denied') })).toBeUndefined()
  })

  it('can retain known data after a recoverable refresh failure', () => {
    expect(readableQueryData(true, { data, error: new ApiError(500, 'unavailable') })).toBe(data)
  })
})

describe('dashboard activity evidence', () => {
  it('merges known log sources chronologically without treating IDs as numbers', () => {
    const login: LoginLogRow = {
      id: '9223372036854775806',
      username: 'Example',
      ip: null,
      userAgent: null,
      success: 1,
      message: null,
      loginTime: '2026-09-27T08:00:00',
    }
    const operation: OperLogRow = {
      id: '9223372036854775806',
      title: 'User <supplied> title',
      businessType: 'UPDATE',
      method: null,
      operName: 'Example',
      operIp: null,
      operParam: null,
      operResult: null,
      status: 1,
      errorMsg: null,
      operTime: '2026-09-27T09:00:00',
      costTime: null,
    }
    const items = recentActivity([login], [operation])
    expect(items.map((item) => item.kind)).toEqual(['operation', 'login'])
    expect(new Set(items.map((item) => item.id)).size).toBe(2)
    expect(items[0].row).toBe(operation)
    expect(recentActivity()).toEqual([])
  })
})
