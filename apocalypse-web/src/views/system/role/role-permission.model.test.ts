import { describe, expect, it } from 'vitest'

import {
  buildRolePermissionModel,
  canReadRolePermissionGraph,
  canReadRoleWorkspace,
  rolePermissionPage,
  resolveRolePermissionOpening,
  synchronizeRolePermissionSelection,
  searchRolePermissionNodes,
  type RawRoleMenu,
} from './role-permission.model'

function node(
  id: string,
  parentId: string,
  menuName: string,
  extra: Partial<RawRoleMenu> = {},
): RawRoleMenu {
  return {
    id,
    parentId,
    menuName,
    type: 'M',
    path: null,
    component: null,
    perms: null,
    icon: null,
    sort: 0,
    ...extra,
  }
}

const tree = [
  node('100', '0', 'Management', {
    type: 'C',
    perms: 'system:overview',
    children: [
      node('110', '100', '成员管理', {
        perms: 'system:user:list',
        children: [
          node('9223372036854775801', '110', '添加成员', { type: 'F', perms: 'system:user:add' }),
          node('9223372036854775802', '110', 'Invite member', {
            type: 'F',
            perms: 'system:user:add',
          }),
        ],
      }),
      node('120', '100', 'Calendar', {
        status: 0,
        visible: 0,
        moduleKey: 'calendar',
        perms: 'calendar:day:read',
      }),
    ],
  }),
]

describe('role permission configuration projection', () => {
  it('retains real ancestors as context without inventing their assignments or permissions', () => {
    const model = buildRolePermissionModel(tree, ['9223372036854775801'])
    expect(model.nodes.map((entry) => [entry.id, entry.assigned])).toEqual([
      ['100', false],
      ['110', false],
      ['9223372036854775801', true],
    ])
    expect(model.permissionSources.map((entry) => entry.perms)).toEqual(['system:user:add'])
    expect(model.byId.get('9223372036854775801')?.pathNames).toEqual([
      'Management',
      '成员管理',
      '添加成员',
    ])
    expect(model.roots).toEqual(['100'])
  })

  it('reads permission identifiers on C/M/F and retains duplicate source nodes', () => {
    const model = buildRolePermissionModel(tree, [
      '100',
      '110',
      '9223372036854775801',
      '9223372036854775802',
    ])
    expect(model.permissionSources).toHaveLength(4)
    expect(model.permissionCount).toBe(3)
    expect(
      model.permissionSources.filter((entry) => entry.perms === 'system:user:add'),
    ).toHaveLength(2)
  })

  it('preserves hidden, disabled and optional-module definitions instead of claiming effective access', () => {
    const model = buildRolePermissionModel(tree, ['120'])
    expect(model.byId.get('120')).toMatchObject({
      assigned: true,
      status: 0,
      visible: 0,
      moduleKey: 'calendar',
    })
    expect(model.permissionCount).toBe(1)
    expect(model.byId.get('100')?.assigned).toBe(false)
  })

  it('reports unresolved IDs and deduplicates repeated associations without changing snowflake IDs', () => {
    const model = buildRolePermissionModel(tree, [
      '9223372036854775801',
      '9223372036854775801',
      '9223372036854775807',
    ])
    expect(model.assignedCount).toBe(2)
    expect(model.resolvedCount).toBe(1)
    expect(model.unresolvedIds).toEqual(['9223372036854775807'])
    expect(model.byId.has('9223372036854775801')).toBe(true)
  })

  it('represents a verified empty assignment response without adding sample nodes', () => {
    const model = buildRolePermissionModel(tree, [])
    expect(model.nodes).toEqual([])
    expect(model.roots).toEqual([])
    expect(model.assignedCount).toBe(0)
    expect(model.permissionCount).toBe(0)
  })

  it('searches localized original names, source paths, permission identifiers and IDs', () => {
    const model = buildRolePermissionModel(tree, ['9223372036854775801', '120'])
    expect(searchRolePermissionNodes(model, '成员管理').map((entry) => entry.id)).toEqual([
      '110',
      '9223372036854775801',
    ])
    expect(searchRolePermissionNodes(model, 'SYSTEM:USER:ADD').map((entry) => entry.id)).toEqual([
      '9223372036854775801',
    ])
    expect(searchRolePermissionNodes(model, '9223372036854775801')).toHaveLength(1)
    expect(searchRolePermissionNodes(model, 'no-result')).toEqual([])
  })

  it('bounds a graph neighborhood while keeping every branch reachable across pages', () => {
    const ids = Array.from({ length: 11 }, (_, index) => String(index))
    expect([0, 1, 2].flatMap((page) => rolePermissionPage(ids, page, 4).items)).toEqual(ids)
    expect(rolePermissionPage(ids, 99, 4)).toMatchObject({ page: 2, pageCount: 3, total: 11 })
  })

  it('requires an accepted identity and both read permissions', () => {
    expect(canReadRoleWorkspace({ meLoaded: true, perms: ['system:role:list'] })).toBe(true)
    expect(canReadRoleWorkspace({ meLoaded: false, perms: ['system:role:list'] })).toBe(false)
    expect(canReadRoleWorkspace({ meLoaded: true, perms: ['system:menu:list'] })).toBe(false)
    expect(
      canReadRolePermissionGraph({
        meLoaded: true,
        perms: ['system:role:list', 'system:menu:list'],
      }),
    ).toBe(true)
    expect(
      canReadRolePermissionGraph({
        meLoaded: false,
        perms: ['system:role:list', 'system:menu:list'],
      }),
    ).toBe(false)
    expect(canReadRolePermissionGraph({ meLoaded: true, perms: ['system:role:list'] })).toBe(false)
    expect(canReadRolePermissionGraph({ meLoaded: true, perms: ['system:menu:list'] })).toBe(false)
  })

  it('derives the default role and refreshes selected metadata without replacing its opening identity', () => {
    const role = {
      id: '1',
      roleName: 'Old name',
      roleKey: 'reader',
      status: 1,
      dataScope: 'ALL',
      sort: 8,
      remark: 'Preserved note',
    }
    const first = resolveRolePermissionOpening(null, [role], 4, 'workspace')!
    const fresh = { ...role, roleName: 'New name', status: 0, dataScope: 'DEPT' }
    const updated = resolveRolePermissionOpening(first, [fresh], 4, 'workspace')!
    expect(updated.role).toEqual(fresh)
    expect(updated.openId).toBe(first.openId)
    const accepted = synchronizeRolePermissionSelection(first, [fresh])!
    expect(resolveRolePermissionOpening(accepted, [], 4, 'workspace')?.role).toEqual(fresh)
    expect(accepted.openId).toBe(first.openId)
    expect(synchronizeRolePermissionSelection(accepted, [{ ...fresh }])).toBe(accepted)
    const changedSort = synchronizeRolePermissionSelection(accepted, [{ ...fresh, sort: 9 }])!
    expect(changedSort.role.sort).toBe(9)
    expect(changedSort.openId).toBe(accepted.openId)
    const changedRemark = synchronizeRolePermissionSelection(changedSort, [
      { ...fresh, sort: 9, remark: 'Updated note' },
    ])!
    expect(changedRemark.role.remark).toBe('Updated note')
    expect(resolveRolePermissionOpening(first, [], 4, 'workspace')?.role).toEqual(role)
    expect(resolveRolePermissionOpening(null, [], 4, 'workspace')).toBeNull()
  })
})
