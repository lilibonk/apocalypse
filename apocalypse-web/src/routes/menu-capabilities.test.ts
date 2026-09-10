import { describe, expect, it } from 'vitest'

import { normalizeMenuNode, type RawMenuNode } from '@/lib/api/types'

import { hasMenuModule } from './menu-capabilities'

function menu(overrides: Partial<RawMenuNode> = {}): RawMenuNode {
  return {
    id: '1',
    parentId: '0',
    menuName: '工作台',
    type: 'M',
    path: 'dashboard',
    component: 'dashboard/index',
    perms: null,
    icon: null,
    sort: 1,
    children: [],
    ...overrides,
  }
}

describe('menu capability lifecycle', () => {
  it('从后端 moduleKey 识别嵌套模块，不从路径字符串猜测', () => {
    const menus = [
      normalizeMenuNode(
        menu({
          menuName: '万年历',
          moduleKey: 'calendar',
          path: '/renamed-time-space',
          children: [menu({ id: '2', parentId: '1', moduleKey: 'calendar' })],
        }),
      ),
    ]

    expect(hasMenuModule(menus, 'calendar')).toBe(true)
    expect(hasMenuModule(menus, 'unknown')).toBe(false)
  })

  it('旧后端未返回 moduleKey 时保持 fail-closed', () => {
    const menus = [normalizeMenuNode(menu({ path: '/calendar' }))]

    expect(hasMenuModule(menus, 'calendar')).toBe(false)
  })
})
