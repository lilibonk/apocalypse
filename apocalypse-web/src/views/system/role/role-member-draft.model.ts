import type { RoleGraphMember } from './role-permission.queries'

export interface RoleMemberDraft {
  baseline: ReadonlySet<string>
  selected: ReadonlySet<string>
}

export type RoleMemberLinkState = 'linked' | 'unlinked' | 'added' | 'removed'

/** Only the complete edit-authorized ID endpoint may initialize this replacement set. */
export function createRoleMemberDraft(userIds: readonly string[]): RoleMemberDraft {
  return { baseline: new Set(userIds), selected: new Set(userIds) }
}

export function roleMemberLinkState(draft: RoleMemberDraft, id: string): RoleMemberLinkState {
  return draft.baseline.has(id)
    ? draft.selected.has(id)
      ? 'linked'
      : 'removed'
    : draft.selected.has(id)
      ? 'added'
      : 'unlinked'
}

export function toggleRoleMember(draft: RoleMemberDraft, id: string): RoleMemberDraft {
  const selected = new Set(draft.selected)
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
  return { ...draft, selected }
}

export function undoRoleMember(draft: RoleMemberDraft, id: string): RoleMemberDraft {
  const selected = new Set(draft.selected)
  if (draft.baseline.has(id)) selected.add(id)
  else selected.delete(id)
  return { ...draft, selected }
}

export function resetRoleMemberDraft(draft: RoleMemberDraft): RoleMemberDraft {
  return { baseline: draft.baseline, selected: new Set(draft.baseline) }
}

export function roleMemberChanges(draft: RoleMemberDraft) {
  return {
    added: [...draft.selected].filter((id) => !draft.baseline.has(id)),
    removed: [...draft.baseline].filter((id) => !draft.selected.has(id)),
  }
}

/** Missing profile data never means an invalid relationship or permission to discard it. */
export function unreadRoleMemberIds(
  draft: RoleMemberDraft,
  profiles: ReadonlyMap<string, RoleGraphMember>,
) {
  return [...new Set([...draft.baseline, ...draft.selected])].filter((id) => !profiles.has(id))
}

export function validRoleMemberPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / size)))
}
