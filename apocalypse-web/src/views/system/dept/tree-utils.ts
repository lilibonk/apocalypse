/** 部门树工具：树形表格拍平（展开/折叠）与子树 id 收集。纯函数，单测见 __tests__/tree-utils.test.ts。 */

import type { DeptTreeNode } from './types'

/** 拍平后的表格行。 */
export interface FlatDeptRow {
  node: DeptTreeNode
  /** 缩进层级（根为 0）。 */
  depth: number
  hasChildren: boolean
}

/** 将部门树按折叠状态拍平为表格行（DFS 序；折叠节点的子树不产出行）。 */
export function flattenDeptTree(
  nodes: DeptTreeNode[],
  collapsed: ReadonlySet<string>,
): FlatDeptRow[] {
  const rows: FlatDeptRow[] = []
  const walk = (list: DeptTreeNode[], depth: number) => {
    for (const node of list) {
      const children = node.children ?? []
      rows.push({ node, depth, hasChildren: children.length > 0 })
      if (children.length > 0 && !collapsed.has(node.id)) {
        walk(children, depth + 1)
      }
    }
  }
  walk(nodes, 0)
  return rows
}

/** 收集以 root 为根的整棵子树 id（含 root 自身；编辑态用于禁选自身及下级作父部门）。 */
export function collectSubTreeIds(root: DeptTreeNode): Set<string> {
  const ids = new Set<string>()
  const walk = (node: DeptTreeNode) => {
    ids.add(node.id)
    for (const child of node.children ?? []) {
      walk(child)
    }
  }
  walk(root)
  return ids
}
