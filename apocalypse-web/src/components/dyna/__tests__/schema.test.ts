/**
 * schema 机器可验证性测试：
 * 1. import.meta.glob 自动收集 views 下的全部 *.schema.ts，逐一过 validatePageSchema ——
 *    AI Agent 产出的 page schema 在 CI 即可被拦截；
 * 2. 校验器自身行为单测（合法样例过、典型非法样例挂）。
 */

import { describe, expect, it } from 'vitest'

import { validatePageSchema, type DynaPageSchema } from '../schema'

const schemaModules = import.meta.glob<{ default: unknown }>('../../../views/**/*.schema.ts', {
  eager: true,
})

describe('views 下的 page schema 全量校验', () => {
  it('至少收集到一个 schema 文件', () => {
    expect(Object.keys(schemaModules).length).toBeGreaterThan(0)
  })

  it.each(Object.entries(schemaModules))('%s 通过 validatePageSchema', (_path, module) => {
    const result = validatePageSchema(module.default)
    expect(result.issues).toEqual([])
    expect(result.success).toBe(true)
  })
})

const minimalValid: DynaPageSchema = {
  key: 'demo',
  endpoint: '/system/demo',
  title: '演示',
  columns: [{ key: 'name', title: '名称' }],
}

describe('validatePageSchema 校验器行为', () => {
  it('最小合法 schema 通过', () => {
    expect(validatePageSchema(minimalValid).success).toBe(true)
  })

  it('拒绝未知字段类型', () => {
    const result = validatePageSchema({
      ...minimalValid,
      form: { fields: [{ name: 'x', label: 'X', type: 'richtext' }] },
    })
    expect(result.success).toBe(false)
    expect(result.issues.join('\n')).toContain('type')
  })

  it('select 缺少 options 被拒', () => {
    const result = validatePageSchema({
      ...minimalValid,
      form: { fields: [{ name: 's', label: 'S', type: 'select' }] },
    })
    expect(result.success).toBe(false)
    expect(result.issues.join('\n')).toContain('options')
  })

  it('dict 缺少 dictType 被拒（表单/搜索/列三处）', () => {
    const result = validatePageSchema({
      ...minimalValid,
      search: [{ name: 'st', type: 'dict' }],
      columns: [{ key: 'st', title: '状态', type: 'dict' }],
      form: { fields: [{ name: 'st', label: '状态', type: 'dict' }] },
    })
    expect(result.success).toBe(false)
    expect(result.issues.length).toBeGreaterThanOrEqual(3)
  })

  it('perms 必须符合 域:对象:动作 格式', () => {
    const result = validatePageSchema({ ...minimalValid, createPerm: 'system.user.add' })
    expect(result.success).toBe(false)
    const withForm = {
      ...minimalValid,
      createPerm: 'system:user:add',
      form: { fields: [{ name: 'name', label: '名称', type: 'input' as const }] },
    }
    expect(validatePageSchema(withForm).success).toBe(true)
  })

  it('endpoint 必须以 / 开头，columns 至少一列', () => {
    expect(validatePageSchema({ ...minimalValid, endpoint: 'system/demo' }).success).toBe(false)
    expect(validatePageSchema({ ...minimalValid, columns: [] }).success).toBe(false)
  })

  it('edit 操作必须配 form', () => {
    const result = validatePageSchema({
      ...minimalValid,
      rowActions: [{ kind: 'edit', perm: 'demo:demo:edit' }],
    })
    expect(result.success).toBe(false)
  })

  it('view 操作与 detail 配置合法', () => {
    const result = validatePageSchema({
      ...minimalValid,
      detail: { title: '记录详情', fields: [{ key: 'name', title: '名称' }] },
      rowActions: [{ kind: 'view', perm: 'demo:demo:list' }],
    })
    expect(result.success).toBe(true)
  })

  it('status-toggle 合法样例通过', () => {
    const result = validatePageSchema({
      ...minimalValid,
      rowActions: [
        { kind: 'status-toggle', field: 'status', onValue: 1, offValue: 0, perm: 'demo:demo:edit' },
      ],
    })
    expect(result.success).toBe(true)
    // submitRow（全量替换语义端点）为可选加成项
    const withSubmitRow = validatePageSchema({
      ...minimalValid,
      rowActions: [
        { kind: 'status-toggle', field: 'status', onValue: 1, offValue: 0, submitRow: true },
      ],
    })
    expect(withSubmitRow.success).toBe(true)
  })

  it('custom 行操作合法样例通过（无需 form）', () => {
    const result = validatePageSchema({
      ...minimalValid,
      rowActions: [{ kind: 'custom', key: 'grant', label: '授权', perm: 'demo:demo:edit' }],
    })
    expect(result.success).toBe(true)
  })

  it('custom 行操作缺 key 或 label 被拒', () => {
    const noKey = validatePageSchema({
      ...minimalValid,
      rowActions: [{ kind: 'custom', label: '授权' }],
    })
    expect(noKey.success).toBe(false)
    const noLabel = validatePageSchema({
      ...minimalValid,
      rowActions: [{ kind: 'custom', key: 'grant' }],
    })
    expect(noLabel.success).toBe(false)
  })

  it('custom 行操作 key 重复被拒、perm 格式非法被拒', () => {
    const duplicated = validatePageSchema({
      ...minimalValid,
      rowActions: [
        { kind: 'custom', key: 'grant', label: '授权' },
        { kind: 'custom', key: 'grant', label: '再次授权' },
      ],
    })
    expect(duplicated.success).toBe(false)
    expect(duplicated.issues.join('\n')).toContain('custom key')
    const badPerm = validatePageSchema({
      ...minimalValid,
      rowActions: [{ kind: 'custom', key: 'grant', label: '授权', perm: 'demo.demo.edit' }],
    })
    expect(badPerm.success).toBe(false)
  })
})
