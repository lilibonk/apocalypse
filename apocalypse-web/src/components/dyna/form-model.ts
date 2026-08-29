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
 */

import { z } from 'zod'

import type { DynaFormField } from './schema'

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
    | 'msgMinLen',
  params: Record<string, string | number>,
) => string

/** 按模式过滤可见字段（hideInCreate / hideInEdit）。 */
export function visibleFields(fields: DynaFormField[], mode: 'create' | 'edit'): DynaFormField[] {
  return fields.filter((field) => (mode === 'create' ? !field.hideInCreate : !field.hideInEdit))
}

/** 从字段 schema 生成 zod 校验器（v1：文本长度、数字格式/范围、必选约束）。 */
export function buildFormValidator(fields: DynaFormField[], msg: DynaValidatorMessage) {
  const shape: Record<string, z.ZodType> = {}

  for (const field of fields) {
    const { name, label, type } = field

    if (type === 'switch') {
      shape[name] = z.boolean()
      continue
    }

    if (type === 'number') {
      let rule = z.string()
      if (field.required) rule = rule.min(1, msg('msgInputRequired', { label }))
      shape[name] = rule
        .refine((v) => v === '' || !Number.isNaN(Number(v)), msg('msgNumber', { label }))
        .refine(
          (v) => v === '' || field.min === undefined || Number(v) >= field.min,
          msg('msgMin', { label, min: field.min ?? '' }),
        )
        .refine(
          (v) => v === '' || field.max === undefined || Number(v) <= field.max,
          msg('msgMax', { label, max: field.max ?? '' }),
        )
      continue
    }

    if (type === 'select' || type === 'dict' || type === 'radio') {
      shape[name] = field.required
        ? z.string().min(1, msg('msgSelectRequired', { label }))
        : z.string()
      continue
    }

    // input / textarea / password / date / datetime
    let rule = z.string()
    if (field.required) rule = rule.min(1, msg('msgInputRequired', { label }))
    if (field.maxLength !== undefined) {
      rule = rule.max(field.maxLength, msg('msgMaxLen', { label, max: field.maxLength }))
    }
    if (field.minLength !== undefined) {
      rule = field.required
        ? rule.min(field.minLength, msg('msgMinLen', { label, min: field.minLength }))
        : rule.refine(
            (v) => v === '' || v.length >= (field.minLength ?? 0),
            msg('msgMinLen', { label, min: field.minLength }),
          )
    }
    shape[name] = rule
  }

  return z.object(shape)
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

/** 表单值 → 提交 body（编辑态剔除 disabledInEdit；空串剔除；number 转换）。 */
export function formValuesToBody(
  fields: DynaFormField[],
  values: DynaFormValues,
  mode: 'create' | 'edit',
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const field of fields) {
    if (mode === 'edit' && field.disabledInEdit) continue
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
