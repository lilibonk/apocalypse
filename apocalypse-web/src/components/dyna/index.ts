/**
 * DynaLayer 桶出口。
 * - 空间工作台（Wave 2/3）直接消费 Headless `useDynaController` + `DynaToolbar` / `DynaToolbarActions` + `DynaDialogs`
 * - 高密度流式记录页消费 `DynaPage` 或 `useDynaController` + `DynaTable`
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
  DynaStatusToggleAction,
  DynaTreeNodeOption,
  DynaVisibleWhen,
  SchemaValidationResult,
} from './schema'
export { flattenTreeNodeOptions, isFieldVisible } from './form-model'
export type { DynaSortState } from './use-dyna-url-state'
export {
  useDynaController,
  rowIdOf,
  type DynaCollectionState,
  type DynaController,
  type DynaControllerDialogsState,
  type DynaDialogModeState,
  type DynaRow,
  type DynaToggleState,
  type ScopedDynaAction,
  type UseDynaControllerOptions,
} from './use-dyna-controller'
export {
  DynaToolbar,
  DynaToolbarActions,
  type DynaToolbarActionsProps,
  type DynaToolbarProps,
} from './DynaToolbar'
export { DynaDialogs, type DynaDialogsProps } from './DynaDialogs'
export { DynaSearch } from './DynaSearch'
export { DynaTable, type DynaTableProps } from './DynaTable'
export {
  DynaForm,
  createAsyncFieldValidationController,
  type DynaAsyncFieldValidator,
  type DynaFormProps,
} from './DynaForm'
export { DynaDetail } from './DynaDetail'
export { DynaImportDialog } from './DynaImportDialog'
export { DynaPage, type DynaPageProps } from './DynaPage'
export { DynaQueryFeedback } from './DynaQueryFeedback'
export { DynaPagination, type DynaPaginationProps } from './DynaPagination'
