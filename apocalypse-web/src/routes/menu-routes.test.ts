import { describe, expect, it } from 'vitest'

import { resolveMenuPath } from './menu-routes'

describe('resolveMenuPath', () => {
  it('相对单段路径继承目录', () => {
    expect(resolveMenuPath('user', '/system')).toBe('/system/user')
  })

  it('多级应用路径从根解析，避免重复目录', () => {
    expect(resolveMenuPath('system/user', '/system')).toBe('/system/user')
    expect(resolveMenuPath('system/log/login', '/log')).toBe('/system/log/login')
  })

  it('显式绝对路径保持为根路径', () => {
    expect(resolveMenuPath('/system/role', '/ignored')).toBe('/system/role')
  })
})
