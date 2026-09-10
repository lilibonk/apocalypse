/**
 * DynaLayer schema —— 标准管理台页面的事实来源。
 *
 * 定位：schema 只描述"要什么"（搜索项/表格列/表单字段/操作与权限），
 * 渲染目标是本仓库自己的 token 组件，样式永远由 design token 决定。
 *
 * 逃逸舱原则：越出标准 CRUD 模式的页面（自定义布局、联动逻辑、非 RESTful 端点）
 * 不要硬塞进 schema —— 直接手写 React 页面组件（参照 src/views/_dev/user-handwritten.tsx）。
 * DynaLayer 不是低代码平台，收敛比通用重要。
 *
 * 机器可验证性：schema 是 AI Agent 的主要产出物，views 下全部 *.schema.ts
 * 由 vitest（components/dyna/__tests__/schema.test.ts）自动收集并过 validatePageSchema。
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 表单字段类型 v1（收敛集，禁止贪多；新类型必须先扩展本枚举与渲染器）。 */
export type DynaFieldType =
  | 'input'
  | 'textarea'
  | 'password'
  | 'number'
  | 'select'
  | 'dict'
  | 'date'
  | 'datetime'
  | 'switch'
  | 'radio'

/** select / radio 的静态选项。 */
export interface DynaOption {
  label: string
  value: string
}

/** 表单字段（DynaForm 渲染 + 校验 + 提交转换的事实来源）。 */
export interface DynaFormField {
  /** 提交 body 的字段名，也是行数据回填的 key。 */
  name: string
  /** label 原文；渲染层走 t(`dyna.${label}`, { defaultValue: label }) 兜底原文。 */
  label: string
  type: DynaFieldType
  required?: boolean
  placeholder?: string
  /** 字段下方的辅助说明（FormDescription）。 */
  help?: string
  /** select / radio 必填：静态选项。 */
  options?: DynaOption[]
  /** dict 必填：后端字典类型（react-query 调 /system/dict/data/type/{type}）。 */
  dictType?: string
  /** select / dict / radio 提交值类型：默认 string；'number' 时提交前 Number()（如状态位）。 */
  valueType?: 'string' | 'number'
  minLength?: number
  maxLength?: number
  /** number 字段的数值范围（校验用，表单内仍以 string 承载输入）。 */
  min?: number
  max?: number
  defaultValue?: string | number | boolean
  /** 仅编辑态显示（如状态）。 */
  hideInCreate?: boolean
  /** 仅新增态显示（如密码）。 */
  hideInEdit?: boolean
  /** 编辑态只读展示且不提交（如用户名）。 */
  disabledInEdit?: boolean
  /** 布局：占满整行（默认字段两列网格中的 1 列）。 */
  span?: 1 | 2
}

/** 搜索区字段（v1 收敛为三种控件）。 */
export interface DynaSearchField {
  /** 查询参数名（GET {endpoint}/page 的 query key）。 */
  name: string
  label?: string
  type: 'input' | 'select' | 'dict'
  placeholder?: string
  options?: DynaOption[]
  dictType?: string
}

/** 表格列。 */
export interface DynaColumn {
  /** 行数据字段名；雪花 id 是 string，直接展示，禁止 Number()。 */
  key: string
  title: string
  /** text（默认，null 显示 -）| dict（DictTag 渲染）| datetime（'T' 替换为空格截到秒）。 */
  type?: 'text' | 'dict' | 'datetime'
  dictType?: string
  /** 数据密集型日志页可将最多两列固定在操作列左侧。 */
  sticky?: 'right'
}

/** 行操作：编辑（打开 DynaForm）。 */
export interface DynaEditAction {
  kind: 'edit'
  label?: string
  /** perms 串（域:对象:动作），无权限不渲染。 */
  perm?: string
}

/** 行操作：查看详情（打开 DynaDetail，不发起额外请求）。 */
export interface DynaViewAction {
  kind: 'view'
  label?: string
  perm?: string
}

/** 行操作：删除（AlertDialog 确认 → DELETE {endpoint}/{id}）。 */
export interface DynaDeleteAction {
  kind: 'delete'
  label?: string
  perm?: string
}

/**
 * 行操作：启用/禁用切换（管理台标准模式）。
 * 实现 = PUT {endpoint}/{id} body { [field]: nextValue }（既有更新端点，无独立启停接口）。
 */
export interface DynaStatusToggleAction {
  kind: 'status-toggle'
  /** 状态字段名（如 'status'）。 */
  field: string
  /** “启用/正常”侧的值（提交原样发送，number 就写 number）。 */
  onValue: string | number
  /** “停用/禁用”侧的值。 */
  offValue: string | number
  /** 当前为 off 时按钮文案（默认 '启用'）。 */
  onLabel?: string
  /** 当前为 on 时按钮文案（默认 '禁用'）。 */
  offLabel?: string
  /**
   * 更新端点为全量替换语义（请求记录有必填字段，如 RoleSaveReq 的 roleName/roleKey @NotBlank）时置 true：
   * 提交整行 + 翻转后的状态字段；缺省 false 维持局部提交 { [field]: next }（对应全可选更新请求，如 UserUpdateReq）。
   */
  submitRow?: boolean
  perm?: string
}

/**
 * 行操作：自定义按钮（越出标准 CRUD 的行级动作，如授权/分配弹窗）。
 * 点击行为不由 DynaLayer 实现 —— 页面经 DynaPage 的 customActions prop 按 key 注入 handler；
 * 未注册 handler 的 key 渲染为禁用按钮（schema/handler 失配在页面上可见，不静默吞掉）。
 */
export interface DynaCustomAction {
  kind: 'custom'
  /** handler 注册键（DynaPage customActions 的 key），同页内唯一。 */
  key: string
  /** 按钮文案原文；渲染层走 t() 兜底原文。 */
  label: string
  perm?: string
}

export type DynaRowAction =
  DynaViewAction | DynaEditAction | DynaDeleteAction | DynaStatusToggleAction | DynaCustomAction

/** 标准 CRUD 页 schema（DynaPage 的输入）。 */
export interface DynaPageSchema {
  /** 页面唯一 key（react-query queryKey 用）。 */
  key: string
  /** RESTful 端点：列表 GET {endpoint}/page，新增 POST，更新/启停 PUT {endpoint}/{id}，删除 DELETE。 */
  endpoint: string
  /** 页头标题原文。 */
  title: string
  /** 页头副标题原文。 */
  description?: string
  /** 实体中文名（toast / 删除确认文案，如 '用户'）。 */
  entityName?: string
  /** 行主键字段名（默认 'id'；雪花 string 原样使用）。 */
  rowKey?: string
  pageSize?: number
  /** 列表接口权限；模块 queryScope 页面必填，核心页面保持兼容。 */
  listPerm?: string
  /** 顶部「新增」按钮权限串；缺省不渲染新增按钮。 */
  createPerm?: string
  /** 新增按钮文案（默认 `新增${entityName ?? ''}`）。 */
  createLabel?: string
  search?: DynaSearchField[]
  columns: DynaColumn[]
  form?: {
    createTitle?: string
    editTitle?: string
    fields: DynaFormField[]
  }
  /** 详情面板；fields 缺省复用 columns。 */
  detail?: {
    title?: string
    description?: string
    fields?: DynaColumn[]
  }
  rowActions?: DynaRowAction[]
  /** 删除确认文案中展示的行字段（如 'nickname'），缺省回退 rowKey 值。 */
  deleteNameKey?: string
}

/** 出口：让 schema 文件获得完整类型检查与推断。 */
export function definePageSchema(schema: DynaPageSchema): DynaPageSchema {
  return schema
}

// ---------------------------------------------------------------------------
// zod 校验器（CI 可检：字段类型枚举、必填约束、dict 绑定、perms 格式）
// ---------------------------------------------------------------------------

/** perms 命名约定：域:对象:动作（如 system:user:list）。 */
export const PERMS_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/

const permsString = z.string().regex(PERMS_PATTERN, 'perms 必须是 域:对象:动作 格式')

const optionSchema = z.object({
  label: z.string().min(1),
  value: z.string(),
})

const formFieldSchema = z
  .object({
    name: z.string().min(1),
    label: z.string().min(1),
    type: z.enum([
      'input',
      'textarea',
      'password',
      'number',
      'select',
      'dict',
      'date',
      'datetime',
      'switch',
      'radio',
    ]),
    required: z.boolean().optional(),
    placeholder: z.string().optional(),
    help: z.string().optional(),
    options: z.array(optionSchema).optional(),
    dictType: z.string().min(1).optional(),
    valueType: z.enum(['string', 'number']).optional(),
    minLength: z.number().int().positive().optional(),
    maxLength: z.number().int().positive().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
    hideInCreate: z.boolean().optional(),
    hideInEdit: z.boolean().optional(),
    disabledInEdit: z.boolean().optional(),
    span: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .check((ctx) => {
    const field = ctx.value
    const fail = (message: string) => ctx.issues.push({ code: 'custom', message, input: field })
    if ((field.type === 'select' || field.type === 'radio') && !field.options?.length) {
      fail(`字段 ${field.name}：${field.type} 类型必须提供非空 options`)
    }
    if (field.type === 'dict' && !field.dictType) {
      fail(`字段 ${field.name}：dict 类型必须绑定 dictType`)
    }
    if (field.type !== 'number' && (field.min !== undefined || field.max !== undefined)) {
      fail(`字段 ${field.name}：min/max 仅适用于 number 类型`)
    }
  })

const searchFieldSchema = z
  .object({
    name: z.string().min(1),
    label: z.string().min(1).optional(),
    type: z.enum(['input', 'select', 'dict']),
    placeholder: z.string().optional(),
    options: z.array(optionSchema).optional(),
    dictType: z.string().min(1).optional(),
  })
  .check((ctx) => {
    const field = ctx.value
    const fail = (message: string) => ctx.issues.push({ code: 'custom', message, input: field })
    if (field.type === 'select' && !field.options?.length) {
      fail(`搜索项 ${field.name}：select 类型必须提供非空 options`)
    }
    if (field.type === 'dict' && !field.dictType) {
      fail(`搜索项 ${field.name}：dict 类型必须绑定 dictType`)
    }
  })

const columnSchema = z
  .object({
    key: z.string().min(1),
    title: z.string().min(1),
    type: z.enum(['text', 'dict', 'datetime']).optional(),
    dictType: z.string().min(1).optional(),
    sticky: z.literal('right').optional(),
  })
  .check((ctx) => {
    const column = ctx.value
    if (column.type === 'dict' && !column.dictType) {
      ctx.issues.push({
        code: 'custom',
        message: `列 ${column.key}：dict 渲染必须绑定 dictType`,
        input: column,
      })
    }
  })

const rowActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('view'), label: z.string().optional(), perm: permsString.optional() }),
  z.object({ kind: z.literal('edit'), label: z.string().optional(), perm: permsString.optional() }),
  z.object({
    kind: z.literal('delete'),
    label: z.string().optional(),
    perm: permsString.optional(),
  }),
  z.object({
    kind: z.literal('status-toggle'),
    field: z.string().min(1),
    onValue: z.union([z.string(), z.number()]),
    offValue: z.union([z.string(), z.number()]),
    onLabel: z.string().optional(),
    offLabel: z.string().optional(),
    submitRow: z.boolean().optional(),
    perm: permsString.optional(),
  }),
  z.object({
    kind: z.literal('custom'),
    key: z.string().min(1),
    label: z.string().min(1),
    perm: permsString.optional(),
  }),
])

export const pageSchemaValidator = z
  .object({
    key: z.string().min(1),
    endpoint: z.string().regex(/^\//, 'endpoint 必须以 / 开头'),
    title: z.string().min(1),
    description: z.string().optional(),
    entityName: z.string().optional(),
    rowKey: z.string().min(1).optional(),
    pageSize: z.number().int().positive().optional(),
    listPerm: permsString.optional(),
    createPerm: permsString.optional(),
    createLabel: z.string().optional(),
    search: z.array(searchFieldSchema).optional(),
    columns: z.array(columnSchema).min(1, 'columns 至少一列'),
    form: z
      .object({
        createTitle: z.string().optional(),
        editTitle: z.string().optional(),
        fields: z.array(formFieldSchema).min(1),
      })
      .optional(),
    detail: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        fields: z.array(columnSchema).min(1).optional(),
      })
      .optional(),
    rowActions: z.array(rowActionSchema).optional(),
    deleteNameKey: z.string().optional(),
  })
  .check((ctx) => {
    const schema = ctx.value
    const fail = (message: string) => ctx.issues.push({ code: 'custom', message, input: schema })
    if (schema.form) {
      const names = schema.form.fields.map((field) => field.name)
      if (new Set(names).size !== names.length) fail('form.fields 存在重复 name')
    }
    const actions = schema.rowActions ?? []
    if (actions.some((action) => action.kind === 'edit') && !schema.form) {
      fail('rowActions 含 edit 时必须提供 form')
    }
    const customKeys = actions.filter((action) => action.kind === 'custom').map((a) => a.key)
    if (new Set(customKeys).size !== customKeys.length) {
      fail('rowActions 存在重复 custom key')
    }
    if (schema.createPerm && !schema.form) {
      fail('配置 createPerm 时必须提供 form（新增表单）')
    }
  })

export interface SchemaValidationResult {
  success: boolean
  /** 人类可读的校验问题列表（success 时为空）。 */
  issues: string[]
}

/** 校验 page schema；不抛异常，结果给 CI 断言或渲染层降级用。 */
export function validatePageSchema(schema: unknown): SchemaValidationResult {
  const result = pageSchemaValidator.safeParse(schema)
  if (result.success) return { success: true, issues: [] }
  return {
    success: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    ),
  }
}
