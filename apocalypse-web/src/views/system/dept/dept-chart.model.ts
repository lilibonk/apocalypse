import type { DeptTreeNode } from './types'

/** Card size and spacing in canvas units (CSS px at scale 1). */
export const chartGeometry = { nodeWidth: 176, nodeHeight: 68, gapX: 24, gapY: 72, padding: 32 }

export interface ChartNode {
  node: DeptTreeNode
  x: number
  y: number
  depth: number
  parentId: string | null
  hasChildren: boolean
  expanded: boolean
}

export interface ChartEdge {
  from: string
  to: string
  d: string
}

export interface ChartLayout {
  nodes: ChartNode[]
  edges: ChartEdge[]
  width: number
  height: number
}

/** Expanded set for the default view: every node above `depth` levels is open. */
export function defaultExpanded(tree: readonly DeptTreeNode[], depth = 1): Set<string> {
  const open = new Set<string>()
  const walk = (nodes: readonly DeptTreeNode[], level: number) => {
    for (const node of nodes) {
      if (level < depth && node.children?.length) {
        open.add(node.id)
        walk(node.children, level + 1)
      }
    }
  }
  walk(tree, 0)
  return open
}

/**
 * Layered tidy layout: leaves take consecutive slots, parents centre over their visible children.
 * O(n) in visible nodes; collapsed subtrees are not laid out.
 */
export function layoutTree(
  tree: readonly DeptTreeNode[],
  expanded: ReadonlySet<string>,
): ChartLayout {
  const { nodeWidth, nodeHeight, gapX, gapY, padding } = chartGeometry
  const nodes: ChartNode[] = []
  const edges: ChartEdge[] = []
  let slot = 0
  let maxDepth = 0
  const place = (node: DeptTreeNode, depth: number, parentId: string | null): number => {
    maxDepth = Math.max(maxDepth, depth)
    const children = node.children ?? []
    const open = expanded.has(node.id) && children.length > 0
    let x: number
    const childXs: number[] = []
    if (open) {
      for (const child of children) childXs.push(place(child, depth + 1, node.id))
      x = (childXs[0] + childXs[childXs.length - 1]) / 2
    } else {
      x = padding + slot * (nodeWidth + gapX)
      slot++
    }
    const y = padding + depth * (nodeHeight + gapY)
    nodes.push({
      node,
      x,
      y,
      depth,
      parentId,
      hasChildren: children.length > 0,
      expanded: open,
    })
    if (open) {
      const fromX = x + nodeWidth / 2
      const fromY = y + nodeHeight
      const midY = fromY + gapY / 2
      children.forEach((child, index) => {
        const toX = childXs[index] + nodeWidth / 2
        const toY = y + nodeHeight + gapY
        edges.push({
          from: node.id,
          to: child.id,
          d: `M${fromX},${fromY} V${midY} H${toX} V${toY}`,
        })
      })
    }
    return x
  }
  for (const root of tree) place(root, 0, null)
  return {
    nodes,
    edges,
    width: Math.max(1, slot) * (nodeWidth + gapX) - gapX + padding * 2,
    height: (maxDepth + 1) * (nodeHeight + gapY) - gapY + padding * 2,
  }
}

/** Root → target id chain (inclusive); empty when the target is not in the tree. */
export function ancestorPath(tree: readonly DeptTreeNode[], targetId: string): string[] {
  const walk = (nodes: readonly DeptTreeNode[], trail: string[]): string[] | null => {
    for (const node of nodes) {
      const next = [...trail, node.id]
      if (node.id === targetId) return next
      const found = walk(node.children ?? [], next)
      if (found) return found
    }
    return null
  }
  return walk(tree, []) ?? []
}

export function findNode(tree: readonly DeptTreeNode[], id: string): DeptTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findNode(node.children ?? [], id)
    if (found) return found
  }
  return null
}

/** Keyboard tree navigation over the visible layout. */
export function nextFocus(layout: ChartLayout, currentId: string, key: string): string | null {
  const current = layout.nodes.find((item) => item.node.id === currentId)
  if (!current) return null
  const siblings = layout.nodes
    .filter((item) => item.parentId === current.parentId)
    .sort((a, b) => a.x - b.x)
  const index = siblings.findIndex((item) => item.node.id === currentId)
  switch (key) {
    case 'ArrowUp':
      return current.parentId
    case 'ArrowDown': {
      const children = layout.nodes
        .filter((item) => item.parentId === currentId)
        .sort((a, b) => a.x - b.x)
      return children[0]?.node.id ?? null
    }
    case 'ArrowLeft':
      return siblings[index - 1]?.node.id ?? null
    case 'ArrowRight':
      return siblings[index + 1]?.node.id ?? null
    case 'Home':
      return siblings[0]?.node.id ?? null
    case 'End':
      return siblings[siblings.length - 1]?.node.id ?? null
    default:
      return null
  }
}
