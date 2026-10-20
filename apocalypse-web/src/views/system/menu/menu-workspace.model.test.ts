import { describe, expect, it } from 'vitest'
import { menuAncestorPath, visibleMenuNodes } from './menu-workspace.model'
import { normalizeMenuTreeNode } from './menu.types'

const tree = [
  normalizeMenuTreeNode({
    id: 'r',
    parentId: '0',
    menuName: 'Root',
    type: 'C',
    children: [
      {
        id: 'a',
        parentId: 'r',
        menuName: 'Same name',
        type: 'C',
        children: [{ id: 'leaf', parentId: 'a', menuName: 'Page', type: 'M' }],
      },
      { id: 'b', parentId: 'r', menuName: 'Same name', type: 'M' },
    ],
  }),
]

describe('navigation workspace context', () => {
  it('uses stable ids to expand a deep target even when names repeat', () => {
    expect(menuAncestorPath(tree, 'leaf').map((node) => node.id)).toEqual(['r', 'a', 'leaf'])
    expect(menuAncestorPath(tree, 'b').map((node) => node.id)).toEqual(['r', 'b'])
    expect(menuAncestorPath(tree, 'deleted')).toEqual([])
  })
  it('keeps collapsed descendants out of keyboard order and restores their depth when opened', () => {
    expect(visibleMenuNodes(tree, new Set(['a'])).map(({ node }) => node.id)).toEqual([
      'r',
      'a',
      'b',
    ])
    expect(visibleMenuNodes(tree, new Set()).find(({ node }) => node.id === 'leaf')?.depth).toBe(2)
  })
})
