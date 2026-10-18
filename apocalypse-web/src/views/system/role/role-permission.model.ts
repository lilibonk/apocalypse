import type { RawMenuNode, SnowflakeId } from '@/lib/api/types'

/** The management endpoint includes definition state; it does not report effective grants. */
export interface RawRoleMenu extends Omit<RawMenuNode, 'children'> {
  status?: number | null
  visible?: number | null
  children?: RawRoleMenu[] | null
}

export interface RolePermissionTarget {
  id: SnowflakeId
  roleName: string
  roleKey: string
  status: number | null
  dataScope: string | null
  authorizationRevision?: string
  /** Real role rows include these fields; optional keeps read-only historical callers compatible. */
  sort?: number | null
  remark?: string | null
}

export interface RolePermissionOpening {
  role: RolePermissionTarget
  openId: string
  principalEpoch: number
}

export interface RolePermissionNode {
  id: SnowflakeId
  parentId: SnowflakeId
  name: string
  type: 'C' | 'M' | 'F'
  perms: string | null
  moduleKey: string | null
  status: number | null
  visible: number | null
  path: string | null
  pathIds: SnowflakeId[]
  pathNames: string[]
  children: SnowflakeId[]
  assigned: boolean
}

export interface RolePermissionModel {
  nodes: RolePermissionNode[]
  byId: ReadonlyMap<string, RolePermissionNode>
  roots: SnowflakeId[]
  assignedCount: number
  resolvedCount: number
  permissionSources: RolePermissionNode[]
  permissionCount: number
  unresolvedIds: SnowflakeId[]
}

export const ROLE_GRAPH_BRANCH_SIZE = 4
export const ROLE_GRAPH_LIST_SIZE = 12

export function synchronizeRolePermissionSelection(
  selection: RolePermissionOpening | null,
  roles: readonly RolePermissionTarget[],
): RolePermissionOpening | null {
  if (!selection) return null
  const current = roles.find((role) => role.id === selection.role.id)
  if (!current) return selection
  const previous = selection.role
  if (
    current.roleName === previous.roleName &&
    current.roleKey === previous.roleKey &&
    current.status === previous.status &&
    current.dataScope === previous.dataScope &&
    current.sort === previous.sort &&
    current.remark === previous.remark &&
    current.authorizationRevision === previous.authorizationRevision
  )
    return selection
  return { ...selection, role: current }
}

/** Fresh role metadata must not reset a selected node or change the request ownership. */
export function resolveRolePermissionOpening(
  selection: RolePermissionOpening | null,
  roles: readonly RolePermissionTarget[],
  principalEpoch: number,
  workspaceId: string,
): RolePermissionOpening | null {
  const role = roles.find((entry) => entry.id === selection?.role.id) ?? selection?.role ?? roles[0]
  return role
    ? { role, principalEpoch, openId: selection?.openId ?? `${workspaceId}:initial:${role.id}` }
    : null
}

export function canReadRoleWorkspace(auth: {
  meLoaded: boolean
  perms: readonly string[]
}): boolean {
  return auth.meLoaded && auth.perms.includes('system:role:list')
}

export function canReadRolePermissionGraph(auth: {
  meLoaded: boolean
  perms: readonly string[]
}): boolean {
  return canReadRoleWorkspace(auth) && auth.perms.includes('system:menu:list')
}

export function canManageRoleRelations(auth: {
  meLoaded: boolean
  perms: readonly string[]
  allScopePerms: readonly string[]
}) {
  return canReadRoleWorkspace(auth) && auth.allScopePerms.includes('system:role:edit')
}

/** Preserve assignment identity. Ancestors supply context, never an inferred grant. */
export function buildRolePermissionModel(
  tree: readonly RawRoleMenu[],
  assignedIds: readonly SnowflakeId[],
): RolePermissionModel {
  const assigned = new Set(assignedIds)
  const all = new Map<string, RolePermissionNode>()
  const rootIds: string[] = []
  const visit = (nodes: readonly RawRoleMenu[], pathIds: string[], pathNames: string[]) => {
    for (const raw of nodes) {
      // A malformed duplicate cannot create a cycle or invent another source path.
      if (all.has(raw.id)) continue
      const node: RolePermissionNode = {
        id: raw.id,
        parentId: raw.parentId,
        name: raw.menuName,
        type: raw.menuType ?? raw.type ?? 'M',
        perms: raw.perms ?? null,
        moduleKey: raw.moduleKey ?? null,
        status: raw.status ?? null,
        visible: raw.visible ?? null,
        path: raw.path ?? null,
        pathIds: [...pathIds, raw.id],
        pathNames: [...pathNames, raw.menuName],
        children: [],
        assigned: assigned.has(raw.id),
      }
      all.set(node.id, node)
      if (pathIds.length === 0) rootIds.push(node.id)
      visit(raw.children ?? [], node.pathIds, node.pathNames)
      node.children = [
        ...new Set(
          (raw.children ?? [])
            .filter((child) => all.get(child.id)?.pathIds.at(-2) === node.id)
            .map((child) => child.id),
        ),
      ]
    }
  }
  visit(tree, [], [])

  const relevant = new Set<string>()
  const unresolvedIds: string[] = []
  for (const id of assigned) {
    const node = all.get(id)
    if (!node) unresolvedIds.push(id)
    else node.pathIds.forEach((ancestorId) => relevant.add(ancestorId))
  }
  const nodes = [...all.values()]
    .filter((node) => relevant.has(node.id))
    .map((node) => ({ ...node, children: node.children.filter((id) => relevant.has(id)) }))
  const permissionSources = nodes.filter(
    (node) => node.assigned && node.perms !== null && node.perms !== '',
  )
  return {
    nodes,
    byId: new Map(nodes.map((node) => [node.id, node])),
    roots: rootIds.filter((id) => relevant.has(id)),
    assignedCount: assigned.size,
    resolvedCount: nodes.filter((node) => node.assigned).length,
    permissionSources,
    permissionCount: new Set(permissionSources.map((node) => node.perms)).size,
    unresolvedIds,
  }
}

export function searchRolePermissionNodes(
  model: RolePermissionModel,
  query: string,
): RolePermissionNode[] {
  const keyword = query.trim().toLocaleLowerCase()
  if (!keyword) return model.nodes
  return model.nodes.filter((node) =>
    [node.name, node.id, node.perms ?? '', node.pathNames.join(' / '), node.moduleKey ?? ''].some(
      (value) => value.toLocaleLowerCase().includes(keyword),
    ),
  )
}

export function rolePermissionPage<T>(items: readonly T[], requestedPage: number, size: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1)
  return {
    items: items.slice(page * size, (page + 1) * size),
    page,
    pageCount,
    total: items.length,
  }
}
