import { describe, expect, it } from 'vitest'
import { departmentOptionsQuery, flattenDepartmentOptions } from './department-options'
import {
  defaultFormValues,
  formValuesToBody,
  rowToFormValues,
  buildFormValidator,
} from '@/components/dyna/form-model'
import { roleFormConfig } from '../role/RoleForm'
import roleSchema from '../role/role.schema'
import userSchema from './user.schema'

describe('department scope client contracts', () => {
  it('separates operation and identity in department option cache keys', () => {
    expect(departmentOptionsQuery('create', 1).queryKey).not.toEqual(
      departmentOptionsQuery('edit', 1).queryKey,
    )
    expect(departmentOptionsQuery('create', 1).queryKey).not.toEqual(
      departmentOptionsQuery('create', 2).queryKey,
    )
  })
  it('preserves snowflake string IDs and raw business department labels', () => {
    expect(
      flattenDepartmentOptions([
        {
          id: '9223372036854775806',
          parentId: '0',
          deptName: '正常',
          leader: null,
          phone: null,
          remark: null,
          sort: 0,
          status: 1,
          children: [],
        },
      ]),
    ).toEqual([{ value: '9223372036854775806', label: '正常' }])
  })
  it('defaults new role scope to DEPT but omitted scope on edit retains the backend value', () => {
    const createFields = roleFormConfig(roleSchema.form!, 'create').fields
    const editFields = roleFormConfig(roleSchema.form!, 'edit').fields
    expect(defaultFormValues(createFields).dataScope).toBe('DEPT')
    expect(
      formValuesToBody(
        editFields,
        rowToFormValues(editFields, { roleName: 'Legacy', roleKey: 'legacy' }),
        'edit',
      ),
    ).not.toHaveProperty('dataScope')
    expect(
      formValuesToBody(editFields, rowToFormValues(editFields, { dataScope: 'ALL' }), 'edit')
        .dataScope,
    ).toBe('ALL')
  })
  it('rejects a new multi-byte password over 72 bytes without normalizing input', () => {
    const password = userSchema.form!.fields.find((field) => field.name === 'password')!
    const validator = buildFormValidator([password], (key) => key)
    expect(validator.safeParse({ password: 'Ab1!' + '界'.repeat(23) }).success).toBe(false)
    expect(validator.safeParse({ password: 'Ab1!' + '界'.repeat(22) }).success).toBe(true)
  })
})
