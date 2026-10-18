import { describe, expect, it } from 'vitest'

import {
  derivePermissionStudy,
  initialPermissionState,
  selectPermissionGroup,
  selectPermissionRole,
  selectStudyPermission,
  studyPermissions,
} from './permission-model'

describe('permission study model', () => {
  it('keeps summary, group counts and the selected path on the same role grant set', () => {
    const state = selectPermissionRole('operator')
    const result = derivePermissionStudy(state)
    expect(result.granted).toHaveLength(6)
    expect(result.groups.map((group) => group.id)).toEqual(['members', 'calendar'])
    expect(result.groups.flatMap((group) => group.permissions)).toEqual(result.granted)
    expect(result.activeGroup?.id).toBe('members')
  })

  it('never returns a permission removed by a role switch', () => {
    const forbidden = studyPermissions.find((permission) => permission.id === 'system:role:update')!
    const selected = selectStudyPermission(initialPermissionState, forbidden)
    const result = derivePermissionStudy({ ...selected, roleId: 'auditor' })
    expect(result.activePermission).toBeNull()
    expect(result.granted.some((permission) => permission.id === forbidden.id)).toBe(false)
  })

  it('matches localized labels and permission codes only within the selected role', () => {
    const state = selectPermissionRole('operator')
    const result = derivePermissionStudy({ ...state, query: 'CALENDAR' })
    expect(result.matching).toHaveLength(3)
    expect(result.activeGroup?.id).toBe('calendar')
    expect(derivePermissionStudy({ ...state, query: '导出' }).matching).toHaveLength(0)
    expect(derivePermissionStudy({ ...state, query: 'system:user:create' }).matching).toHaveLength(
      1,
    )
  })

  it('collapses a selected group and restores the full role overview', () => {
    const collapsed = selectPermissionGroup(initialPermissionState, 'members')
    const result = derivePermissionStudy(collapsed)
    expect(result.activeGroup).toBeNull()
    expect(result.activePermissions).toEqual([])
    expect(result.path).toHaveLength(1)
    expect(result.groups).toHaveLength(3)
  })

  it('preserves matching results when a searched group is collapsed', () => {
    const result = derivePermissionStudy({
      ...initialPermissionState,
      groupId: null,
      query: 'Calendar',
    })
    expect(result.matching).toHaveLength(4)
    expect(result.activeGroup).toBeNull()
    expect(result.activePermissions).toEqual([])
  })

  it('derives a complete role → group → permission path from the selected permission', () => {
    const permission = studyPermissions.find((entry) => entry.id === 'calendar:calendar:update')!
    const result = derivePermissionStudy(selectStudyPermission(initialPermissionState, permission))
    expect(result.path.map((entry) => entry.en)).toEqual([
      'Administrator',
      'Calendar',
      'Edit calendars',
    ])
    expect(result.activePermissions).toContain(permission)
  })
})
