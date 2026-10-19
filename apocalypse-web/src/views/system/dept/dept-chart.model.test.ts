import { describe, expect, it } from 'vitest'

import {
  ancestorPath,
  chartGeometry,
  defaultExpanded,
  findNode,
  layoutTree,
  nextFocus,
} from './dept-chart.model'
import type { DeptTreeNode } from './types'

const dept = (id: string, children: DeptTreeNode[] = []): DeptTreeNode => ({
  id,
  parentId: '0',
  deptName: id,
  leader: null,
  phone: null,
  sort: 0,
  status: 1,
  remark: null,
  children,
})

const tree = [dept('root', [dept('a', [dept('a1'), dept('a2')]), dept('b', [dept('b1')])])]

describe('department chart model', () => {
  it('opens the first levels by default', () => {
    expect([...defaultExpanded(tree, 1)]).toEqual(['root'])
    expect(defaultExpanded(tree, 2)).toEqual(new Set(['root', 'a', 'b']))
  })

  it('centres parents over visible children and skips collapsed subtrees', () => {
    const collapsed = layoutTree(tree, new Set(['root']))
    expect(collapsed.nodes.map((item) => item.node.id).sort()).toEqual(['a', 'b', 'root'])
    const root = collapsed.nodes.find((item) => item.node.id === 'root')!
    const a = collapsed.nodes.find((item) => item.node.id === 'a')!
    const b = collapsed.nodes.find((item) => item.node.id === 'b')!
    expect(root.x).toBe((a.x + b.x) / 2)
    expect(a.y).toBe(root.y + chartGeometry.nodeHeight + chartGeometry.gapY)
    const open = layoutTree(tree, new Set(['root', 'a', 'b']))
    expect(open.nodes).toHaveLength(6)
    expect(open.edges).toHaveLength(5)
    const xs = open.nodes.filter((item) => item.depth === 2).map((item) => item.x)
    expect(new Set(xs).size).toBe(xs.length)
    expect(open.width).toBeGreaterThan(collapsed.width)
  })

  it('returns the root-to-target chain and finds nodes', () => {
    expect(ancestorPath(tree, 'a2')).toEqual(['root', 'a', 'a2'])
    expect(ancestorPath(tree, 'missing')).toEqual([])
    expect(findNode(tree, 'b1')?.deptName).toBe('b1')
  })

  it('moves focus between parent, children and siblings', () => {
    const layout = layoutTree(tree, new Set(['root', 'a']))
    expect(nextFocus(layout, 'a', 'ArrowUp')).toBe('root')
    expect(nextFocus(layout, 'a', 'ArrowDown')).toBe('a1')
    expect(nextFocus(layout, 'a', 'ArrowRight')).toBe('b')
    expect(nextFocus(layout, 'b', 'ArrowDown')).toBeNull()
    expect(nextFocus(layout, 'a2', 'Home')).toBe('a1')
  })

  it('lays out a 500-department tree quickly', () => {
    const big = [
      dept(
        'r',
        Array.from({ length: 20 }, (_, i) =>
          dept(
            `d${i}`,
            Array.from({ length: 24 }, (__, j) => dept(`d${i}-${j}`)),
          ),
        ),
      ),
    ]
    const all = defaultExpanded(big, 3)
    const started = performance.now()
    const layout = layoutTree(big, all)
    expect(layout.nodes).toHaveLength(501)
    expect(performance.now() - started).toBeLessThan(50)
  })
})
