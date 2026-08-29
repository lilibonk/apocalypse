/**
 * DynaLayer 桶出口。页面侧通常只需要 DynaPage + definePageSchema；
 * 搜索/表格/表单/详情四个渲染器可独立使用（非 CRUD 组合场景）。
 */

export { definePageSchema, validatePageSchema } from './schema'
export type {
  DynaColumn,
  DynaCustomAction,
  DynaFieldType,
  DynaFormField,
  DynaOption,
  DynaPageSchema,
  DynaRowAction,
  DynaSearchField,
  SchemaValidationResult,
} from './schema'
export { DynaSearch } from './DynaSearch'
export { DynaTable } from './DynaTable'
export { DynaForm } from './DynaForm'
export { DynaDetail } from './DynaDetail'
export { DynaPage } from './DynaPage'
