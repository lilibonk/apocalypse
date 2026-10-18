import { describe, expect, it } from 'vitest'

import { formValuesToBody, rowToFormValues, visibleFields } from '@/components/dyna/form-model'
import { roleFormConfig } from './RoleForm'
import schema from './role.schema'
import type { RolePermissionTarget } from './role-permission.model'
import {
  hasCompleteRoleGraphRecord,
  roleGraphCommandPerm,
  roleGraphFormBody,
  roleGraphToggleBody,
} from './role-graph-crud.model'

const role: RolePermissionTarget = {
  id: '9223372036854775801',
  roleName: '审计员',
  roleKey: 'audit',
  status: 1,
  dataScope: 'DEPT_AND_CHILDREN',
  authorizationRevision: '12',
  sort: 47,
  remark: '保留原备注',
}

describe('role graph replacement contracts', () => {
  it('changes only status and preserves every ordinary field when toggling', () => {
    expect(roleGraphToggleBody(role)).toEqual({
      roleName: '审计员',
      roleKey: 'audit',
      status: 0,
      dataScope: 'DEPT_AND_CHILDREN',
      sort: 47,
      remark: '保留原备注',
      expectedAuthorizationRevision: '12',
    })
    expect(roleGraphToggleBody({ ...role, status: 0 }).status).toBe(1)
  })

  it('refuses a narrow graph projection instead of clearing unseen fields', () => {
    const projection = { ...role }
    delete projection.sort
    delete projection.remark
    expect(hasCompleteRoleGraphRecord(projection)).toBe(false)
    expect(() => roleGraphToggleBody(projection)).toThrow('完整属性')
  })

  it('round-trips full role values through the same form rules as the list', () => {
    const fields = visibleFields(roleFormConfig(schema.form!, 'edit').fields, 'edit')
    const values = rowToFormValues(fields, { ...role })
    values.roleName = '新角色名称'
    expect(roleGraphFormBody(formValuesToBody(fields, values, 'edit'), 'edit', '12')).toEqual({
      roleName: '新角色名称',
      roleKey: 'audit',
      status: 1,
      dataScope: 'DEPT_AND_CHILDREN',
      sort: 47,
      remark: '保留原备注',
      expectedAuthorizationRevision: '12',
    })
  })

  it('retains absent legacy data scope while allowing an explicit remark clear', () => {
    const fields = visibleFields(roleFormConfig(schema.form!, 'edit').fields, 'edit')
    const values = rowToFormValues(fields, { ...role, dataScope: null })
    values.remark = ''
    const body = roleGraphFormBody(formValuesToBody(fields, values, 'edit'), 'edit', '12')
    expect(body).not.toHaveProperty('dataScope')
    expect(body.remark).toBeNull()
    expect(body.sort).toBe(47)
  })

  it('maps each object command to its existing write permission', () => {
    expect(roleGraphCommandPerm({ id: 'draft', kind: 'create' })).toBe('system:role:add')
    expect(roleGraphCommandPerm({ id: 'edit', kind: 'edit', role })).toBe('system:role:edit')
    expect(roleGraphCommandPerm({ id: 'toggle', kind: 'toggle', role })).toBe('system:role:edit')
    expect(roleGraphCommandPerm({ id: 'delete', kind: 'delete', role })).toBe('system:role:remove')
  })
})
