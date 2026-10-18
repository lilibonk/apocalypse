import { describe, expect, it } from 'vitest'
import {
  addRoleGrant,
  createRoleGrantDraft,
  grantWindowError,
  grantWindowState,
  removeRoleGrant,
  resetRoleGrantDraft,
  roleGrantChanges,
  roleGrantSubmission,
  sameRoleGrant,
  undoRoleGrant,
  updateRoleGrant,
  type RoleGrant,
  type RoleGrantsBaseline,
} from './role-grant.model'
import { canConfigurePermission, type PermissionDefinition } from '../permission/permission.types'
import { canManageRoleRelations } from './role-permission.model'
const grant = (permissionId: string, patch: Partial<RoleGrant> = {}): RoleGrant => ({
  permissionId,
  enabled: true,
  scopeOverride: 'INHERIT_ROLE',
  validFrom: null,
  validUntil: null,
  ...patch,
})
const baseline: RoleGrantsBaseline = {
  roleId: 'role',
  revision: '9223372036854775801',
  catalogRevision: '9',
  grants: [
    { ...grant('hidden'), definition: null },
    { ...grant('visible'), definition: null },
  ],
}
const definition: PermissionDefinition = {
  id: '1',
  code: 'system:user:list',
  name: 'Read users',
  description: null,
  moduleKey: null,
  resource: 'user',
  action: 'list',
  status: 1,
  lifecycle: 'ACTIVE',
  version: 1,
  supportedScopeOverrides: ['INHERIT_ROLE', 'ALL', 'DEPT', 'DEPT_AND_CHILDREN'],
  declarationSource: 'SystemPermissionActions',
  registered: true,
  referenceRoleCount: '2',
}
describe('complete permission grant draft', () => {
  it('keeps opaque assignments untouched while submitting only added and explicitly changed IDs', () => {
    let draft = createRoleGrantDraft(baseline.grants)
    draft = addRoleGrant(draft, '9223372036854775806')
    draft = updateRoleGrant(draft, 'visible', {
      scopeOverride: 'DEPT',
      enabled: false,
      validFrom: '2026-10-18T00:00:00Z',
    })
    expect(draft.current.get('hidden')).toEqual(grant('hidden'))
    expect(roleGrantSubmission(baseline, draft)).toEqual({
      expectedRevision: '9223372036854775801',
      expectedCatalogRevision: '9',
      upsert: [
        grant('9223372036854775806'),
        grant('visible', {
          scopeOverride: 'DEPT',
          enabled: false,
          validFrom: '2026-10-18T00:00:00Z',
        }),
      ],
      remove: [],
    })
  })
  it('removes only the requested unknown relationship and restores it independently', () => {
    let draft = removeRoleGrant(
      addRoleGrant(createRoleGrantDraft(baseline.grants), 'new'),
      'hidden',
    )
    expect(roleGrantSubmission(baseline, draft).remove).toEqual(['hidden'])
    draft = undoRoleGrant(draft, 'hidden')
    expect(draft.current.has('new')).toBe(true)
    expect(draft.current.get('hidden')).toEqual(grant('hidden'))
    expect(roleGrantChanges(resetRoleGrantDraft(draft))).toEqual({
      added: [],
      updated: [],
      removed: [],
    })
  })
  it('does not mutate the baseline or change permission identity through field edits', () => {
    const source = grant('original')
    const draft = createRoleGrantDraft([source])
    source.enabled = false
    const changed = updateRoleGrant(draft, 'original', { scopeOverride: 'DEPT_AND_CHILDREN' })
    expect(draft.baseline.get('original')?.enabled).toBe(true)
    expect(draft.current.get('original')?.scopeOverride).toBe('INHERIT_ROLE')
    expect(changed.current.get('original')?.scopeOverride).toBe('DEPT_AND_CHILDREN')
  })
  it('recognizes the same absolute instant despite a different timezone representation', () => {
    const a = grant('1', { validFrom: '2026-10-18T08:00:00+08:00' })
    expect(sameRoleGrant(a, { ...a, validFrom: '2026-10-18T00:00:00Z' })).toBe(true)
  })
  it('validates explicit timezone instants and requires an increasing interval', () => {
    expect(grantWindowError(grant('1', { validFrom: '2026-10-18T08:00' }))).toBe('invalid')
    expect(
      grantWindowError(
        grant('1', { validFrom: '2026-10-18T08:00:00+08:00', validUntil: '2026-10-18T00:00:00Z' }),
      ),
    ).toBe('order')
    expect(
      grantWindowError(
        grant('1', { validFrom: '2026-10-18T00:00:00Z', validUntil: '2026-10-19T00:00:00Z' }),
      ),
    ).toBeNull()
  })
  it('describes a half-open window without pretending to compute user authorization', () => {
    const timed = grant('1', {
      validFrom: '2026-10-18T00:00:00Z',
      validUntil: '2026-10-19T00:00:00Z',
    })
    expect(grantWindowState(timed, Date.parse('2026-10-17T23:59:59Z'))).toBe('scheduled')
    expect(grantWindowState(timed, Date.parse(timed.validFrom!))).toBe('withinWindow')
    expect(grantWindowState(timed, Date.parse(timed.validUntil!))).toBe('expired')
    expect(grantWindowState({ ...timed, enabled: false }, Date.parse(timed.validFrom!))).toBe(
      'paused',
    )
  })
  it('allows configuration only for registered, enabled ACTIVE definitions', () => {
    expect(canConfigurePermission(definition)).toBe(true)
    for (const patch of [
      { registered: false },
      { status: 0 },
      { lifecycle: 'DEPRECATED' as const },
      { lifecycle: 'LEGACY' as const },
    ])
      expect(canConfigurePermission({ ...definition, ...patch })).toBe(false)
    expect(canConfigurePermission(null)).toBe(false)
  })
  it('requires an ALL-scoped role edit grant even when the action exists in scoped permissions', () => {
    expect(
      canManageRoleRelations({
        meLoaded: true,
        perms: ['system:role:list', 'system:role:edit'],
        allScopePerms: [],
      }),
    ).toBe(false)
    expect(
      canManageRoleRelations({
        meLoaded: true,
        perms: ['system:role:list', 'system:role:edit'],
        allScopePerms: ['system:role:edit'],
      }),
    ).toBe(true)
  })
})
