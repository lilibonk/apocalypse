import { describe, expect, it } from 'vitest'

import type { RawRoleMenu } from './role-permission.model'
import {
  buildRolePermissionCatalog,
  createRolePermissionDraft,
  linkRolePermission,
  resetRolePermissionDraft,
  rolePermissionAdditions,
  rolePermissionCandidates,
  rolePermissionDraftChanges,
  rolePermissionDraftState,
  undoRolePermissionChange,
  unlinkRolePermission,
  unresolvedRolePermissionIds,
  unresolvedSelectedRolePermissionIds,
} from './role-permission-draft.model'

const definition = { path: null, component: null, icon: null, sort: 0 }
const tree: RawRoleMenu[] = [
  {
    ...definition,
    id: '1',
    parentId: '0',
    menuName: '系统',
    type: 'C',
    perms: 'system:home',
    children: [
      {
        ...definition,
        id: '2',
        parentId: '1',
        menuName: '角色',
        type: 'M',
        perms: 'system:role:list',
        children: [
          {
            ...definition,
            id: '3',
            parentId: '2',
            menuName: '编辑角色',
            type: 'F',
            perms: 'system:role:edit',
          },
          {
            ...definition,
            id: '4',
            parentId: '2',
            menuName: '删除角色',
            type: 'F',
            perms: 'system:role:remove',
          },
        ],
      },
    ],
  },
]
const catalog = buildRolePermissionCatalog(tree)

describe('editable permission relationship draft', () => {
  it('keeps all unassigned candidates without treating definitions as granted', () => {
    expect(catalog.nodes).toHaveLength(4)
    expect(catalog.nodes.every((node) => !node.assigned)).toBe(true)
    expect(rolePermissionCandidates(catalog, '2', '').map((node) => node.id)).toEqual(['3', '4'])
    expect(rolePermissionCandidates(catalog, null, 'role:remove').map((node) => node.id)).toEqual([
      '4',
    ])
  })

  it('adds the selected permission and missing ancestors, never siblings or descendants', () => {
    const initial = createRolePermissionDraft(['1'])
    expect(rolePermissionAdditions(catalog, initial, '3')).toEqual(['2', '3'])
    const changed = linkRolePermission(catalog, initial, '3')
    expect([...changed.selected]).toEqual(['1', '2', '3'])
    expect(changed.selected.has('4')).toBe(false)
    expect([...initial.selected]).toEqual(['1'])
    expect(rolePermissionDraftChanges(changed)).toEqual({ added: ['2', '3'], removed: [] })
    expect(rolePermissionDraftState(changed, '1')).toBe('linked')
    expect(rolePermissionDraftState(changed, '3')).toBe('added')
    expect(rolePermissionDraftState(changed, '4')).toBe('unlinked')
    expect([...linkRolePermission(catalog, createRolePermissionDraft([]), '2').selected]).toEqual([
      '1',
      '2',
    ])
  })

  it('removes only the explicit association and preserves other meaningful parent and child grants', () => {
    const initial = createRolePermissionDraft(['1', '2', '3', '4'])
    const changed = unlinkRolePermission(initial, '2')
    expect([...changed.selected]).toEqual(['1', '3', '4'])
    expect(rolePermissionDraftState(changed, '2')).toBe('removed')
    expect(rolePermissionDraftChanges(changed)).toEqual({ added: [], removed: ['2'] })
    expect([...undoRolePermissionChange(changed, '2').selected].sort()).toEqual([
      '1',
      '2',
      '3',
      '4',
    ])
  })

  it('preserves unresolved snowflake IDs in the replacement set until explicitly removed', () => {
    const unresolved = '9223372036854775806'
    const initial = createRolePermissionDraft(['1', unresolved])
    const changed = linkRolePermission(catalog, initial, '3')
    expect(changed.selected.has(unresolved)).toBe(true)
    expect(unresolvedRolePermissionIds(catalog, changed)).toEqual([unresolved])
    expect(unresolvedSelectedRolePermissionIds(catalog, changed)).toEqual([unresolved])
    const removed = unlinkRolePermission(changed, unresolved)
    expect(rolePermissionDraftChanges(removed).removed).toEqual([unresolved])
    expect(unresolvedRolePermissionIds(catalog, removed)).toEqual([unresolved])
    expect(unresolvedSelectedRolePermissionIds(catalog, removed)).toEqual([])
    expect(undoRolePermissionChange(removed, unresolved).selected.has(unresolved)).toBe(true)
  })

  it('cancels edits exactly back to the accepted baseline without mutating it', () => {
    const initial = createRolePermissionDraft(['1', '4'])
    const changed = unlinkRolePermission(linkRolePermission(catalog, initial, '3'), '4')
    const reset = resetRolePermissionDraft(changed)
    expect([...reset.selected]).toEqual(['1', '4'])
    expect(rolePermissionDraftChanges(reset)).toEqual({ added: [], removed: [] })
    expect([...initial.baseline]).toEqual(['1', '4'])
  })
})
