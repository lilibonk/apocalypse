import type { RawRoleMenu, RolePermissionNode } from './role-permission.model'

/** The editor keeps the whole definition catalog; a read-only projection omits candidates. */
export interface RolePermissionCatalog {
  nodes: RolePermissionNode[]
  byId: ReadonlyMap<string, RolePermissionNode>
  roots: string[]
}

export interface RolePermissionDraft {
  baseline: ReadonlySet<string>
  selected: ReadonlySet<string>
}

export type RolePermissionDraftState = 'linked' | 'unlinked' | 'added' | 'removed'

export function buildRolePermissionCatalog(tree: readonly RawRoleMenu[]): RolePermissionCatalog {
  const byId = new Map<string, RolePermissionNode>()
  const roots: string[] = []
  const visit = (items: readonly RawRoleMenu[], pathIds: string[], pathNames: string[]) => {
    for (const item of items) {
      if (byId.has(item.id)) continue
      const node: RolePermissionNode = {
        id: item.id,
        parentId: item.parentId,
        name: item.menuName,
        type: item.menuType ?? item.type ?? 'M',
        perms: item.perms ?? null,
        moduleKey: item.moduleKey ?? null,
        status: item.status ?? null,
        visible: item.visible ?? null,
        path: item.path ?? null,
        pathIds: [...pathIds, item.id],
        pathNames: [...pathNames, item.menuName],
        children: [],
        // Catalog entries are definitions; only the separate draft decides assignment.
        assigned: false,
      }
      byId.set(item.id, node)
      if (pathIds.length === 0) roots.push(item.id)
      visit(item.children ?? [], node.pathIds, node.pathNames)
      node.children = [
        ...new Set(
          (item.children ?? [])
            .filter((child) => byId.get(child.id)?.pathIds.at(-2) === item.id)
            .map((child) => child.id),
        ),
      ]
    }
  }
  visit(tree, [], [])
  return { nodes: [...byId.values()], byId, roots }
}

/** Unknown IDs stay in both sets until the operator explicitly removes them. */
export function createRolePermissionDraft(ids: readonly string[]): RolePermissionDraft {
  return { baseline: new Set(ids), selected: new Set(ids) }
}

export function rolePermissionDraftState(
  draft: RolePermissionDraft,
  id: string,
): RolePermissionDraftState {
  const before = draft.baseline.has(id)
  const after = draft.selected.has(id)
  return before ? (after ? 'linked' : 'removed') : after ? 'added' : 'unlinked'
}

export function rolePermissionAdditions(
  catalog: RolePermissionCatalog,
  draft: RolePermissionDraft,
  id: string,
): string[] {
  return catalog.byId.get(id)?.pathIds.filter((ancestor) => !draft.selected.has(ancestor)) ?? []
}

/** Add the selected definition and its ancestors; never grant unseen descendants. */
export function linkRolePermission(
  catalog: RolePermissionCatalog,
  draft: RolePermissionDraft,
  id: string,
): RolePermissionDraft {
  const additions = rolePermissionAdditions(catalog, draft, id)
  if (!additions.length) return draft
  const selected = new Set(draft.selected)
  additions.forEach((addition) => selected.add(addition))
  return { ...draft, selected }
}

/** Removing one direct association never silently removes its ancestors or descendants. */
export function unlinkRolePermission(draft: RolePermissionDraft, id: string): RolePermissionDraft {
  if (!draft.selected.has(id)) return draft
  const selected = new Set(draft.selected)
  selected.delete(id)
  return { ...draft, selected }
}

export function undoRolePermissionChange(
  draft: RolePermissionDraft,
  id: string,
): RolePermissionDraft {
  const selected = new Set(draft.selected)
  if (draft.baseline.has(id)) selected.add(id)
  else selected.delete(id)
  return { ...draft, selected }
}

export function resetRolePermissionDraft(draft: RolePermissionDraft): RolePermissionDraft {
  return { baseline: draft.baseline, selected: new Set(draft.baseline) }
}

export function rolePermissionDraftChanges(draft: RolePermissionDraft) {
  return {
    added: [...draft.selected].filter((id) => !draft.baseline.has(id)),
    removed: [...draft.baseline].filter((id) => !draft.selected.has(id)),
  }
}

export function unresolvedRolePermissionIds(
  catalog: RolePermissionCatalog,
  draft: RolePermissionDraft,
): string[] {
  return [...new Set([...draft.baseline, ...draft.selected])].filter((id) => !catalog.byId.has(id))
}

/** A replacement containing unresolvable definitions cannot be reviewed as valid. */
export function unresolvedSelectedRolePermissionIds(
  catalog: RolePermissionCatalog,
  draft: RolePermissionDraft,
): string[] {
  return [...draft.selected].filter((id) => !catalog.byId.has(id))
}

export function rolePermissionCandidates(
  catalog: RolePermissionCatalog,
  parentId: string | null,
  search: string,
): RolePermissionNode[] {
  const query = search.trim().toLocaleLowerCase()
  if (query)
    return catalog.nodes.filter((node) =>
      [node.name, node.perms ?? '', node.id, node.pathNames.join(' / ')].some((value) =>
        value.toLocaleLowerCase().includes(query),
      ),
    )
  const ids = parentId ? (catalog.byId.get(parentId)?.children ?? []) : catalog.roots
  return ids.flatMap((id) => {
    const node = catalog.byId.get(id)
    return node ? [node] : []
  })
}
