import type { MenuNode } from './menu.types'

export function menuAncestorPath(nodes: readonly MenuNode[], id: string): MenuNode[] {
  for (const node of nodes) {
    if (node.id === id) return [node]
    const childPath = menuAncestorPath(node.children, id)
    if (childPath.length) return [node, ...childPath]
  }
  return []
}

export function visibleMenuNodes(
  nodes: readonly MenuNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
): { node: MenuNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(collapsed.has(node.id) ? [] : visibleMenuNodes(node.children, collapsed, depth + 1)),
  ])
}
