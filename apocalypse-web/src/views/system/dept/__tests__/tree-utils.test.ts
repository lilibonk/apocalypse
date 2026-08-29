/** 部门树工具单测：拍平（展开/折叠）与子树 id 收集。 */

import { describe, expect, it } from 'vitest'

import { collectSubTreeIds, flattenDeptTree } from '../tree-utils'
import type { DeptTreeNode } from '../types'

function node(id: string, deptName: string, children: DeptTreeNode[] | null = null): DeptTreeNode {
  return {
    id,
    parentId: '0',
    deptName,
    leader: null,
    phone: null,
    sort: 0,
    status: 1,
    remark: null,
    children,
  }
}

// 1（总公司）
// ├── 2（技术中心）
// │   ├── 4（研发部）
// │   └── 5（测试部）
// └── 3（市场部）
const tree: DeptTreeNode[] = [
  node('1', '总公司', [
    node('2', '技术中心', [node('4', '研发部'), node('5', '测试部')]),
    node('3', '市场部'),
  ]),
]

describe('flattenDeptTree', () => {
  it('全展开时按 DFS 序产出全部行，深度与 hasChildren 正确', () => {
    const rows = flattenDeptTree(tree, new Set())
    expect(rows.map((row) => row.node.id)).toEqual(['1', '2', '4', '5', '3'])
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 2, 1])
    expect(rows.map((row) => row.hasChildren)).toEqual([true, true, false, false, false])
  })

  it('折叠节点保留自身行但不产出其子树', () => {
    const rows = flattenDeptTree(tree, new Set(['2']))
    expect(rows.map((row) => row.node.id)).toEqual(['1', '2', '3'])
  })

  it('折叠根节点只保留根行', () => {
    const rows = flattenDeptTree(tree, new Set(['1']))
    expect(rows.map((row) => row.node.id)).toEqual(['1'])
  })

  it('children 为 null / 空数组时视为叶子', () => {
    const rows = flattenDeptTree([node('9', '叶子', [])], new Set())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.hasChildren).toBe(false)
  })
})

describe('collectSubTreeIds', () => {
  it('收集自身及全部后代 id', () => {
    const tech = tree[0]?.children?.[0]
    expect(tech).toBeDefined()
    if (!tech) return
    expect(collectSubTreeIds(tech)).toEqual(new Set(['2', '4', '5']))
  })

  it('叶子节点只含自身', () => {
    expect(collectSubTreeIds(node('7', '独立部门'))).toEqual(new Set(['7']))
  })
})
