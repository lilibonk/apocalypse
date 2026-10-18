import type { PermissionDefinition, ScopeOverride } from '../permission/permission.types'

export interface RoleGrant {
  permissionId: string
  enabled: boolean
  scopeOverride: ScopeOverride
  validFrom: string | null
  validUntil: string | null
}

export interface RoleGrantSource extends RoleGrant {
  definition: PermissionDefinition | null
}

export interface RoleGrantsBaseline {
  roleId: string
  revision: string
  catalogRevision: string
  grants: RoleGrantSource[]
}

export interface RoleGrantDraft {
  baseline: ReadonlyMap<string, RoleGrant>
  current: ReadonlyMap<string, RoleGrant>
}

export interface RoleGrantChanges {
  added: RoleGrant[]
  removed: RoleGrant[]
  updated: { before: RoleGrant; after: RoleGrant }[]
}

export function grantConfiguration(grant: RoleGrant): RoleGrant {
  return {
    permissionId: grant.permissionId,
    enabled: grant.enabled,
    scopeOverride: grant.scopeOverride,
    validFrom: grant.validFrom,
    validUntil: grant.validUntil,
  }
}

export function createRoleGrantDraft(grants: readonly RoleGrant[]): RoleGrantDraft {
  return {
    baseline: new Map(grants.map((grant) => [grant.permissionId, grantConfiguration(grant)])),
    current: new Map(grants.map((grant) => [grant.permissionId, grantConfiguration(grant)])),
  }
}

export function addRoleGrant(draft: RoleGrantDraft, permissionId: string): RoleGrantDraft {
  if (draft.current.has(permissionId)) return draft
  const current = new Map(draft.current)
  current.set(permissionId, {
    permissionId,
    enabled: true,
    scopeOverride: 'INHERIT_ROLE',
    validFrom: null,
    validUntil: null,
  })
  return { ...draft, current }
}

export function removeRoleGrant(draft: RoleGrantDraft, permissionId: string): RoleGrantDraft {
  const current = new Map(draft.current)
  current.delete(permissionId)
  return { ...draft, current }
}

export function updateRoleGrant(
  draft: RoleGrantDraft,
  permissionId: string,
  values: Partial<Omit<RoleGrant, 'permissionId'>>,
): RoleGrantDraft {
  const previous = draft.current.get(permissionId)
  if (!previous) return draft
  const current = new Map(draft.current)
  current.set(permissionId, { ...previous, ...values, permissionId })
  return { ...draft, current }
}

export function undoRoleGrant(draft: RoleGrantDraft, permissionId: string): RoleGrantDraft {
  const current = new Map(draft.current)
  const baseline = draft.baseline.get(permissionId)
  if (baseline) current.set(permissionId, grantConfiguration(baseline))
  else current.delete(permissionId)
  return { ...draft, current }
}

export function resetRoleGrantDraft(draft: RoleGrantDraft): RoleGrantDraft {
  return {
    ...draft,
    current: new Map([...draft.baseline].map(([id, grant]) => [id, grantConfiguration(grant)])),
  }
}

function sameInstant(left: string | null, right: string | null) {
  return (
    left === right || (left !== null && right !== null && Date.parse(left) === Date.parse(right))
  )
}

export function sameRoleGrant(left: RoleGrant, right: RoleGrant): boolean {
  return (
    left.permissionId === right.permissionId &&
    left.enabled === right.enabled &&
    left.scopeOverride === right.scopeOverride &&
    sameInstant(left.validFrom, right.validFrom) &&
    sameInstant(left.validUntil, right.validUntil)
  )
}

export function roleGrantChanges(draft: RoleGrantDraft): RoleGrantChanges {
  const added: RoleGrant[] = []
  const updated: RoleGrantChanges['updated'] = []
  for (const [id, grant] of draft.current) {
    const before = draft.baseline.get(id)
    if (!before) added.push(grant)
    else if (!sameRoleGrant(before, grant)) updated.push({ before, after: grant })
  }
  return {
    added,
    updated,
    removed: [...draft.baseline.values()].filter((grant) => !draft.current.has(grant.permissionId)),
  }
}

/** Only touched identities are written. Opaque or filtered baseline grants remain untouched. */
export function roleGrantSubmission(source: RoleGrantsBaseline, draft: RoleGrantDraft) {
  const changes = roleGrantChanges(draft)
  return {
    expectedRevision: source.revision,
    expectedCatalogRevision: source.catalogRevision,
    upsert: [...changes.added, ...changes.updated.map((change) => change.after)].map(
      grantConfiguration,
    ),
    remove: changes.removed.map((grant) => grant.permissionId),
  }
}

export function grantWindowError(grant: RoleGrant): 'invalid' | 'order' | null {
  const instant = (value: string | null) =>
    value === null ||
    (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value)))
  if (!instant(grant.validFrom) || !instant(grant.validUntil)) return 'invalid'
  return grant.validFrom &&
    grant.validUntil &&
    Date.parse(grant.validFrom) >= Date.parse(grant.validUntil)
    ? 'order'
    : null
}

/** Describes the saved window only; it is never used to decide the current user's access. */
export function grantWindowState(
  grant: RoleGrant,
  now: number,
): 'paused' | 'scheduled' | 'expired' | 'withinWindow' {
  if (!grant.enabled) return 'paused'
  if (grant.validFrom && now < Date.parse(grant.validFrom)) return 'scheduled'
  if (grant.validUntil && now >= Date.parse(grant.validUntil)) return 'expired'
  return 'withinWindow'
}
