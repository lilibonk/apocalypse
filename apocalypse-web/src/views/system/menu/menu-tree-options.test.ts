import { describe, expect, it } from 'vitest'

import type { MenuNode } from './menu.types'
import {
  buildSelectableMenuTree,
  collectExpandedAncestorIds,
  searchSelectableMenus,
} from './menu-tree-options'

function node(
  id: string,
  menuName: string,
  children: MenuNode[] = [],
  menuType: MenuNode['menuType'] = 'M',
): MenuNode {
  return {
    id,
    parentId: '0',
    menuName,
    menuType,
    path: `system/${id}`,
    component: null,
    perms: null,
    icon: 'menu',
    sort: 0,
    visible: 1,
    status: 1,
    remark: null,
    children,
  }
}

describe('menu tree options', () => {
  it('builds breadcrumbs and excludes buttons and forbidden subtrees', () => {
    const tree = [
      node(
        'system',
        '系统管理',
        [
          node('menu', '菜单管理', [node('action', '菜单新增', [], 'F')]),
          node('excluded', '不可选择', [node('hidden-child', '隐藏后代')]),
        ],
        'C',
      ),
    ]

    const options = buildSelectableMenuTree(tree, new Set(['excluded']))

    expect(options[0]?.breadcrumb).toBe('系统管理')
    expect(options[0]?.children[0]?.breadcrumb).toBe('系统管理 / 菜单管理')
    expect(options[0]?.children).toHaveLength(1)
    expect(options[0]?.children[0]?.children).toHaveLength(0)
  })

  it('expands only the ancestor path of the current selection', () => {
    const options = buildSelectableMenuTree(
      [node('a', '一级', [node('b', '二级', [node('c', '三级')])], 'C')],
      new Set(),
    )

    expect([...collectExpandedAncestorIds(options, 'c')]).toEqual(['a', 'b'])
  })

  it('searches names, routes and breadcrumbs while limiting rendered results', () => {
    const children = Array.from({ length: 80 }, (_, index) =>
      node(`item-${index}`, `节点 ${index}`),
    )
    const options = buildSelectableMenuTree([node('root', '系统管理', children, 'C')], new Set())

    const broad = searchSelectableMenus(options, 'system/', 50)
    const breadcrumb = searchSelectableMenus(options, '系统管理 / 节点 79')

    expect(broad.total).toBe(81)
    expect(broad.matches).toHaveLength(50)
    expect(breadcrumb.matches.map((option) => option.id)).toEqual(['item-79'])
  })
})
