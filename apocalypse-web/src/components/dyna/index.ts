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
  DynaTreeNodeOption,
  DynaVisibleWhen,
  SchemaValidationResult,
} from './schema'
export { flattenTreeNodeOptions, isFieldVisible } from './form-model'
export type { DynaSortState } from './use-dyna-url-state'
export { DynaSearch } from './DynaSearch'
export { DynaTable } from './DynaTable'
export {
  DynaForm,
  createAsyncFieldValidationController,
  type DynaAsyncFieldValidator,
} from './DynaForm'
export { DynaDetail } from './DynaDetail'
export { DynaImportDialog } from './DynaImportDialog'
export { DynaPage, type DynaOverviewControls, type DynaWorkspaceControls } from './DynaPage'
export { DynaQueryFeedback } from './DynaQueryFeedback'

export { DynaPagination, type DynaPaginationProps } from './DynaPagination'
