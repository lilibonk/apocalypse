import type { MenuNode, MenuType } from './menu.types'

export const MAX_PARENT_MENU_SEARCH_RESULTS = 50

export interface MenuTreeOption {
  id: string
  menuName: string
  menuType: Exclude<MenuType, 'F'>
  path: string | null
  icon: string | null
  breadcrumb: string
  children: MenuTreeOption[]
}

export function buildSelectableMenuTree(
  nodes: MenuNode[],
  excluded: Set<string>,
  ancestors: string[] = [],
): MenuTreeOption[] {
  const result: MenuTreeOption[] = []

  for (const node of nodes) {
    if (node.menuType === 'F' || excluded.has(node.id)) continue

    const pathNames = [...ancestors, node.menuName]
    result.push({
      id: node.id,
      menuName: node.menuName,
      menuType: node.menuType,
      path: node.path,
      icon: node.icon,
      breadcrumb: pathNames.join(' / '),
      children: buildSelectableMenuTree(node.children, excluded, pathNames),
    })
  }

  return result
}

export function countSelectableMenuOptions(options: MenuTreeOption[]): number {
  return options.reduce(
    (count, option) => count + 1 + countSelectableMenuOptions(option.children),
    0,
  )
}

export function findMenuTreeOption(options: MenuTreeOption[], id: string): MenuTreeOption | null {
  for (const option of options) {
    if (option.id === id) return option
    const match = findMenuTreeOption(option.children, id)
    if (match) return match
  }
  return null
}

export function collectExpandedAncestorIds(
  options: MenuTreeOption[],
  selectedId: string,
): Set<string> {
  const expanded = new Set<string>()

  const findPath = (nodes: MenuTreeOption[], ancestors: string[]): boolean => {
    for (const node of nodes) {
      if (node.id === selectedId) {
        ancestors.forEach((id) => expanded.add(id))
        return true
      }
      if (findPath(node.children, [...ancestors, node.id])) return true
    }
    return false
  }

  findPath(options, [])
  return expanded
}

export function searchSelectableMenus(
  options: MenuTreeOption[],
  query: string,
  limit = MAX_PARENT_MENU_SEARCH_RESULTS,
): { matches: MenuTreeOption[]; total: number } {
  const keyword = query.trim().toLocaleLowerCase()
  if (!keyword) return { matches: [], total: 0 }

  const allMatches: MenuTreeOption[] = []
  const visit = (nodes: MenuTreeOption[]) => {
    for (const node of nodes) {
      const searchable = [node.menuName, node.breadcrumb, node.path ?? '']
        .join(' ')
        .toLocaleLowerCase()
      if (searchable.includes(keyword)) allMatches.push(node)
      visit(node.children)
    }
  }

  visit(options)
  return { matches: allMatches.slice(0, limit), total: allMatches.length }
}
