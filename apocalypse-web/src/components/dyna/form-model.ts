/**
 * DynaForm 运行时模型：从字段 schema 生成 zod 校验器，并负责
 * 表单态（string/boolean）与提交态（后端 body）之间的双向转换。
 *
 * 表单内统一 string 承载输入（switch 用 boolean），提交时按 schema 转换：
 * - number 类型 / valueType:'number' → Number()
 * - switch 默认提交 boolean；valueType:'number' 时提交 1/0（后端 Integer 状态位，
 *   Jackson 不做 boolean→Integer 强转，直接发 boolean 会被 400/500 拒绝）
 * - 空字符串 → 不提交（后端 optional 语义）
 * - 编辑态剔除 disabledInEdit 字段（如用户名只读展示不进 body）
 * - visibleWhen 条件不满足时：自动跳过校验并从提交 body 中剔除
 */

import { z } from 'zod'

import type { DynaFormField, DynaOption, DynaTreeNodeOption } from './schema'

/** 表单值统一形态：文本类 string，switch boolean。 */
export type DynaFormValues = Record<string, string | boolean>

/**
 * 校验消息构造器（由 DynaForm 注入，内部走 locales 的 dyna.msg* 插值模板；
 * params.label 传入前已完成翻译）。
 */
export type DynaValidatorMessage = (
  key:
    | 'msgInputRequired'
    | 'msgSelectRequired'
    | 'msgNumber'
    | 'msgMin'
    | 'msgMax'
    | 'msgMaxLen'
    | 'msgMinLen'
    | 'msgMaxBytes',
  params: Record<string, string | number>,
) => string

/** 展平树形选项为带层级缩进前缀的平面选项列表（供 FieldSelect 渲染）。 */
export function flattenTreeNodeOptions(
  nodes: readonly DynaTreeNodeOption[] | undefined,
  depth = 0,
): DynaOption[] {
  if (!nodes || nodes.length === 0) return []
  const result: DynaOption[] = []
  const prefix = depth > 0 ? `${'　'.repeat(depth)}└ ` : ''
  for (const node of nodes) {
    result.push({ label: `${prefix}${node.label}`, value: node.value })
    if (node.children?.length) {
      result.push(...flattenTreeNodeOptions(node.children, depth + 1))
    }
  }
  return result
}

/** 判断字段在当前表单值下是否满足 visibleWhen 条件。 */
export function isFieldVisible(field: DynaFormField, values: DynaFormValues): boolean {
  const rule = field.visibleWhen
  if (!rule) return true
  const raw = values[rule.field]
  const match = (expected: string | number | boolean) => {
    if (typeof expected === 'boolean') return Boolean(raw) === expected
    return String(raw ?? '') === String(expected)
  }
  if (rule.equals !== undefined && !match(rule.equals)) return false
  if (rule.in && rule.in.length > 0 && !rule.in.some(match)) return false
  return true
}

/** 按模式过滤可见字段（hideInCreate / hideInEdit）。 */
export function visibleFields(fields: DynaFormField[], mode: 'create' | 'edit'): DynaFormField[] {
  return fields.filter((field) => (mode === 'create' ? !field.hideInCreate : !field.hideInEdit))
}

/** 从字段 schema 生成 zod 校验器（支持 visibleWhen 条件豁免）。 */
export function buildFormValidator(fields: DynaFormField[], msg: DynaValidatorMessage) {
  const shape: Record<string, z.ZodType> = {}

  for (const field of fields) {
    const { name, type } = field
    shape[name] = type === 'switch' ? z.boolean() : z.string()
  }

  return z.object(shape).superRefine((values, ctx) => {
    const formValues = values as DynaFormValues
    for (const field of fields) {
      if (!isFieldVisible(field, formValues)) continue
      const { name, label, type } = field
      if (type === 'switch') continue
      const raw = formValues[name]
      const text = typeof raw === 'string' ? raw : ''

      if (type === 'number') {
        if (field.required && text === '') {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: msg('msgInputRequired', { label }),
          })
          continue
        }
        if (text !== '' && Number.isNaN(Number(text))) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: msg('msgNumber', { label }),
          })
          continue
        }
        if (text !== '' && field.min !== undefined && Number(text) < field.min) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: msg('msgMin', { label, min: field.min }),
          })
        }
        if (text !== '' && field.max !== undefined && Number(text) > field.max) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: msg('msgMax', { label, max: field.max }),
          })
        }
        continue
      }

      if (type === 'select' || type === 'dict' || type === 'radio' || type === 'tree-select') {
        if (field.required && text === '') {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: msg('msgSelectRequired', { label }),
          })
        }
        continue
      }

      // input / textarea / password / date / datetime / upload
      if (field.required && text === '') {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: msg('msgInputRequired', { label }),
        })
      }
      if (field.maxLength !== undefined && text.length > field.maxLength) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: msg('msgMaxLen', { label, max: field.maxLength }),
        })
      }
      if (field.minLength !== undefined && text !== '' && text.length < field.minLength) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: msg('msgMinLen', { label, min: field.minLength }),
        })
      }
      if (
        field.maxUtf8Bytes !== undefined &&
        new TextEncoder().encode(text).length > field.maxUtf8Bytes
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: msg('msgMaxBytes', { label, max: field.maxUtf8Bytes }),
        })
      }
    }
  })
}

/** 新增态表单初值：defaultValue → 表单态（switch 转 boolean，其余转 string）。 */
export function defaultFormValues(fields: DynaFormField[]): DynaFormValues {
  const values: DynaFormValues = {}
  for (const field of fields) {
    if (field.type === 'switch') {
      values[field.name] = Boolean(field.defaultValue)
    } else {
      values[field.name] = field.defaultValue !== undefined ? String(field.defaultValue) : ''
    }
  }
  return values
}

/** 编辑态回填：行数据 → 表单态（雪花 id 等 string 原样 String()，禁止 Number 化）。 */
export function rowToFormValues(
  fields: DynaFormField[],
  row: Record<string, unknown>,
): DynaFormValues {
  const values = defaultFormValues(fields)
  for (const field of fields) {
    const raw = row[field.name]
    if (raw === null || raw === undefined) continue
    values[field.name] = field.type === 'switch' ? Boolean(raw) : String(raw)
  }
  return values
}

/** 表单值 → 提交 body（编辑态剔除 disabledInEdit；隐藏字段剔除；空串剔除；number 转换）。 */
export function formValuesToBody(
  fields: DynaFormField[],
  values: DynaFormValues,
  mode: 'create' | 'edit',
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const field of fields) {
    if (mode === 'edit' && field.disabledInEdit) continue
    if (!isFieldVisible(field, values)) continue
    const value = values[field.name]

    if (field.type === 'switch') {
      // 默认提交 boolean；valueType:'number' 提交 1/0（后端 Integer 状态位不吃 boolean）
      body[field.name] = field.valueType === 'number' ? (value ? 1 : 0) : Boolean(value)
      continue
    }

    const text = typeof value === 'string' ? value : ''
    if (text === '') continue
    body[field.name] = field.type === 'number' || field.valueType === 'number' ? Number(text) : text
  }
  return body
}
