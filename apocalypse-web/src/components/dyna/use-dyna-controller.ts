import { isCancelledError, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { EntityRouteIntent } from '@/components/navigation/entity-intent'
import { useStableCallback } from '@/hooks/useStableCallback'
import { ApiError } from '@/lib/api/client'
import { toastApiError } from '@/lib/api/error-toast'
import type { PageResult } from '@/lib/api/types'
import type { ModuleOperation, ModuleScope } from '@/lib/query/module-scope'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'
import { createDynaQueries } from './dyna-queries'
import type { DynaTableProps } from './DynaTable'
import { renderDynaRowActions } from './DynaToolbar'
import {
  validatePageSchema,
  type DynaPageSchema,
  type DynaStatusToggleAction,
  type SchemaValidationResult,
} from './schema'
import { useDynaText } from './use-dyna'
import { expandSearchFieldKeys, useDynaUrlState, type DynaSortState } from './use-dyna-url-state'

export type DynaRow = Record<string, unknown>

export interface ScopedDynaAction {
  operation: ModuleOperation<[DynaRow], unknown>
  onSuccess?: (result: unknown, row: DynaRow) => void
}

export interface DynaDialogModeState {
  mode: 'create' | 'edit'
  row: DynaRow | null
}

export interface DynaToggleState {
  row: DynaRow
  action: DynaStatusToggleAction
  label: string
}

export function rowIdOf(row: DynaRow, rowKey: string): string {
  const id = row[rowKey]
  if (id === null || id === undefined) throw new Error(`行数据缺少主键字段 ${rowKey}`)
  return String(id)
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  if (typeof window === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export interface UseDynaControllerOptions {
  /** Optional module capability scope (e.g. calendar ModuleScope). */
  queryScope?: ModuleScope
  /** Pre-created dyna queries instance (created automatically when omitted). */
  queries?: ReturnType<typeof createDynaQueries>
  /** Embedded mode disables URL search-param synchronization. */
  embedded?: boolean
  /** Legacy entryContext search/selection hint. */
  entryContext?: { key: string; filters: Record<string, string>; selectedRowKey?: string }
  /** Cross-page EntityPill route intent hint. */
  entityIntent?: EntityRouteIntent
  /** Additional non-schema query keys managed via filters (e.g., deptId, includeChildren). */
  extraSearchKeys?: readonly string[]
  /** Custom row action handlers (supports both plain callbacks and ScopedDynaAction). */
  customActions?: Record<string, ((row: DynaRow) => void) | ScopedDynaAction>
  /** Optional callback invoked when retry refreshes companion overview queries. */
  onRefreshCompanion?: (overviewKey: readonly unknown[] | undefined) => void
}

export interface DynaCollectionState extends DynaTableProps {
  isLoading: boolean
  isFetching: boolean
  refetch: () => void
}

export interface DynaControllerDialogsState {
  dialog: DynaDialogModeState | null
  setDialog: (next: DynaDialogModeState | null) => void
  viewing: DynaRow | null
  setViewing: (next: DynaRow | null) => void
  deleting: DynaRow | null
  setDeleting: (next: DynaRow | null) => void
  toggling: DynaToggleState | null
  setToggling: (next: DynaToggleState | null) => void
  batchDeleting: boolean
  setBatchDeleting: (next: boolean) => void
  importing: boolean
  setImporting: (next: boolean) => void
  savePending: boolean
  deletePending: boolean
  batchDeletePending: boolean
  togglePending: boolean
  exportPending: boolean
  submitSave: (body: DynaRow) => void
  confirmDelete: () => void
  confirmBatchDelete: () => void
  confirmToggle: () => void
}

export interface DynaController {
  schema: DynaPageSchema
  queryScope?: ModuleScope
  validation: SchemaValidationResult
  rowKey: string
  entity: string
  queryKey: readonly unknown[] | undefined
  collection: DynaCollectionState
  filters: Readonly<Record<string, string>>
  draftSearch: Record<string, string>
  setDraftSearchField: (name: string, value: string) => void
  submitDraftSearch: () => void
  applyFilters: (values: Record<string, string>) => void
  resetFilters: () => void
  page: number
  size: number
  setPage: (page: number) => void
  setSize: (size: number) => void
  sort: DynaSortState | null
  toggleSort: (field: string) => void
  selectedRowKey: string | null
  selectedRow: DynaRow | null
  selectRow: (key: string | null) => void
  activeRowKey: string | null
  mutatedRowKey: string | null
  selectedKeys: string[]
  setSelectedKeys: (keys: string[]) => void
  permissions: {
    canAdd: boolean
    canEdit: boolean
    canDelete: boolean
    canBatchDelete: boolean
    isDenied: boolean
    hasAllScope: (perm?: string) => boolean
  }
  actions: {
    openCreate: (initialRow?: DynaRow | null) => void
    openEdit: (row: DynaRow) => void
    openView: (row: DynaRow) => void
    requestDelete: (row: DynaRow) => void
    requestBatchDelete: (keys?: string[]) => void
    requestToggle: (row: DynaRow, action: DynaStatusToggleAction, label: string) => void
    openImport: () => void
    triggerExport: () => void
    triggerCustomAction: (actionKey: string, row: DynaRow) => void
    retry: () => Promise<void>
    invalidate: () => Promise<void>
    renderRowActions: (row: DynaRow) => ReactNode
  }
  dialogs: DynaControllerDialogsState
}

/**
 * Headless Dyna controller decoupling query, URL state, real-time authorization denial,
 * module-scoped mutations, and CRUD dialog state from traditional table layout.
 */
export function useDynaController(
  schema: DynaPageSchema,
  options: UseDynaControllerOptions = {},
): DynaController {
  const {
    queryScope,
    queries: providedQueries,
    embedded = false,
    entryContext,
    entityIntent,
    extraSearchKeys,
    customActions,
    onRefreshCompanion,
  } = options

  const t = useDynaText()
  const { t: commonText } = useTranslation()
  const queryClient = useQueryClient()
  const perms = useAuthStore((state) => state.perms)
  const allScopePerms = useAuthStore((state) => state.allScopePerms)
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch ?? 0)
  const authorizationEpoch = useAuthStore(
    (state) => (state as { authorizationEpoch?: number }).authorizationEpoch ?? 0,
  )

  const queries = useMemo(
    () => providedQueries ?? createDynaQueries(schema, queryScope),
    [providedQueries, queryScope, schema],
  )
  const validation = useMemo(() => validatePageSchema(schema), [schema])

  const rowKey = schema.rowKey ?? 'id'
  const defaultPageSize = schema.pageSize ?? 10
  const entity = t(schema.entityName ?? '记录')

  const derivedEntryFilters = useMemo(() => {
    if (entryContext?.filters) return entryContext.filters
    if (!entityIntent) return undefined
    const next: Record<string, string> = {}
    if (entityIntent.label) next.keyword = entityIntent.label
    if (entityIntent.moduleKey) next.moduleKey = entityIntent.moduleKey
    if (entityIntent.resource) next.resource = entityIntent.resource
    if (entityIntent.deptId) next.deptId = entityIntent.deptId
    return Object.keys(next).length > 0 ? next : undefined
  }, [entityIntent, entryContext?.filters])

  const searchFieldNames = useMemo(
    () => [...expandSearchFieldKeys(schema.search), ...(extraSearchKeys ?? [])],
    [extraSearchKeys, schema.search],
  )
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    draftSearch,
    setDraftSearch,
    appliedSearch,
    setAppliedSearch,
    sort,
    setSort,
    toggleSort,
  } = useDynaUrlState({
    embedded,
    defaultPageSize,
    searchFieldNames,
    entryFilters: derivedEntryFilters,
    generationKey: `${sessionEpoch}:${authorizationEpoch}`,
  })

  const [dialog, setDialog] = useState<DynaDialogModeState | null>(null)
  const [viewing, setViewing] = useState<DynaRow | null>(null)
  const [deleting, setDeleting] = useState<DynaRow | null>(null)
  const [toggling, setToggling] = useState<DynaToggleState | null>(null)
  const [mutationDenial, setMutationDenial] = useState<ApiError | null>(null)
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(
    entryContext?.selectedRowKey ?? entityIntent?.id ?? null,
  )
  const [mutatedRowKey, setMutatedRowKey] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [importing, setImporting] = useState(false)

  const effectiveSearch = useMemo(
    () =>
      sort ? { ...appliedSearch, sortField: sort.field, sortOrder: sort.order } : appliedSearch,
    [appliedSearch, sort],
  )

  const { data, isLoading, isFetching, error, refetch } = useQuery<PageResult<DynaRow>>(
    queries.list(
      {
        schemaKey: schema.key,
        endpoint: schema.endpoint,
        page,
        size: pageSize,
        search: effectiveSearch,
      },
      validation.success,
    ),
  )

  const invalidate = useCallback(
    () => queryClient.invalidateQueries(queries.filter()),
    [queries, queryClient],
  )

  const resourceDenial = useResourceDenial({
    errors: [error],
    clear: queries.filter(),
    reset: () => {
      setDialog(null)
      setViewing(null)
      setDeleting(null)
      setToggling(null)
      setSelectedRowKey(null)
      setSelectedKeys([])
      setBatchDeleting(false)
      setImporting(false)
    },
  })

  const onDenied = {
    isCurrent: resourceDenial.isCurrent,
    handle: (err: Error) => {
      if (!isResourceDenied(err)) return
      setMutationDenial(err)
      resourceDenial.handle(err)
    },
  }

  const pageFilter = queries.filter()
  const overviewKey =
    'queryKey' in pageFilter && pageFilter.queryKey
      ? [...pageFilter.queryKey, 'overview']
      : undefined

  const retryList = async () => {
    const denied = mutationDenial
    onRefreshCompanion?.(overviewKey)
    const result = await refetch()
    if (result.isSuccess) setMutationDenial((current) => (current === denied ? null : current))
  }

  const feedbackError =
    mutationDenial && isCancelledError(error) ? mutationDenial : (error ?? mutationDenial)
  const localKey = JSON.stringify([
    page,
    pageSize,
    effectiveSearch,
    dialog,
    deleting,
    toggling,
    viewing,
    batchDeleting,
    importing,
  ])

  const saveMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run, input: { body: DynaRow; mode: 'create' | 'edit'; id?: string }) =>
      input.mode === 'create'
        ? run(queries.create, input.body)
        : run(queries.edit, { id: input.id!, body: input.body }),
    onSuccess: (result, input) => {
      const savedId =
        input.id ??
        (result && typeof result === 'object' && rowKey in result
          ? String((result as DynaRow)[rowKey])
          : null)
      if (savedId) setMutatedRowKey(savedId)
      toast.success(t(input.mode === 'create' ? 'created' : 'updated', { entity }))
      setDialog(null)
      void invalidate()
    },
    onError: (err) => toastApiError(err, t('保存失败')),
  })

  const deleteMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run, id: string) => run(queries.remove, id),
    onSuccess: () => {
      toast.success(t('deleted', { entity }))
      setDeleting(null)
      void invalidate()
    },
    onError: (err) => toastApiError(err, t('删除失败')),
  })

  const batchDeleteMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run, ids: readonly string[]) => run(queries.batchRemove, ids),
    onSuccess: () => {
      toast.success(t('deleted', { entity }))
      setSelectedKeys([])
      setBatchDeleting(false)
      void invalidate()
    },
    onError: (err) => toastApiError(err, t('删除失败')),
  })

  const toggleMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run, input: { id: string; body: DynaRow; action: DynaStatusToggleAction }) => {
      const operation = queries.toggles.get(input.action)
      if (!operation) throw new Error('Unknown Dyna action')
      return run(operation, input)
    },
    onSuccess: (_result, input) => {
      setMutatedRowKey(input.id)
      toast.success(t('操作成功'))
      setToggling(null)
      void invalidate()
    },
    onError: (err) => toastApiError(err, t('操作失败')),
  })

  const customMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run, input: { action: ScopedDynaAction; row: DynaRow }) =>
      run(input.action.operation, input.row),
    onSuccess: (result, input) => input.action.onSuccess?.(result, input.row),
    onError: (err) => toastApiError(err, t('操作失败')),
  })

  const exportMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run) => run(queries.exportCsv, effectiveSearch),
    onSuccess: (blob) => {
      triggerBlobDownload(blob, schema.exportFileName ?? `${schema.key}.csv`)
      toast.success(commonText('common.导出成功', { defaultValue: 'CSV 导出成功' }))
    },
    onError: (err) =>
      toastApiError(err, commonText('common.导出失败', { defaultValue: 'CSV 导出失败' })),
  })

  const customPending = customMutation.isPending
  const togglePending = toggleMutation.isPending
  const runCustom = useStableCallback((action: ScopedDynaAction, row: DynaRow) =>
    customMutation.mutate({ action, row }),
  )
  const retryTable = useStableCallback(() => void retryList())

  const resetFilters = useCallback(() => {
    setDraftSearch({})
    setAppliedSearch({})
    setSort(null)
    setPage(1)
  }, [setAppliedSearch, setDraftSearch, setPage, setSort])

  const applyFilters = useCallback(
    (values: Record<string, string>) => {
      setDraftSearch({ ...values })
      setAppliedSearch({ ...values })
      setPage(1)
    },
    [setAppliedSearch, setDraftSearch, setPage],
  )

  const setDraftSearchField = useCallback(
    (name: string, value: string) => {
      setDraftSearch((draft) => ({ ...draft, [name]: value }))
    },
    [setDraftSearch],
  )

  const submitDraftSearch = useCallback(() => {
    setPage(1)
    setAppliedSearch({ ...draftSearch })
  }, [draftSearch, setAppliedSearch, setPage])

  const changePageSize = useCallback(
    (size: number) => {
      setPage(1)
      setPageSize(size)
    },
    [setPage, setPageSize],
  )

  const activeRow = viewing ?? dialog?.row ?? deleting ?? toggling?.row ?? null
  const activeRowKey = activeRow ? String(activeRow[rowKey] ?? '') : null

  const renderRowActions = useCallback(
    (row: DynaRow) =>
      renderDynaRowActions({
        row,
        schema,
        t,
        commonText,
        customActions,
        queryScope,
        customPending,
        togglePending,
        runCustom,
        setViewing,
        setDialog,
        setDeleting,
        setToggling,
      }),
    [schema, t, commonText, customActions, queryScope, customPending, togglePending, runCustom],
  )

  const rows = data?.list
  const selectedRow = useMemo(() => {
    if (!rows || rows.length === 0) return null
    if (selectedRowKey) {
      const matched = rows.find((item) => String(item[rowKey] ?? '') === selectedRowKey)
      if (matched) return matched
    }
    return rows[0] ?? null
  }, [rowKey, rows, selectedRowKey])

  const collection: DynaCollectionState = {
    columns: schema.columns,
    rows,
    loading: isLoading,
    isLoading,
    isFetching,
    error: feedbackError,
    refreshing: isFetching,
    onRetry: retryTable,
    refetch: retryTable,
    filtered: Object.values(appliedSearch).some((value) => value.trim().length > 0),
    onResetFilters: resetFilters,
    rowKey,
    actions: (schema.rowActions ?? []).length > 0 ? renderRowActions : undefined,
    page,
    size: pageSize,
    total: data?.total ?? 0,
    onPageChange: setPage,
    onPageSizeChange: changePageSize,
    activeRowKey: activeRowKey ?? selectedRowKey,
    mutatedRowKey,
    sort,
    onSortChange: toggleSort,
    selectable: Boolean(schema.batchDeletePerm),
    selectedKeys,
    onSelectedKeysChange: setSelectedKeys,
  }

  const permissions = useMemo(() => {
    const hasPerm = (code?: string, requiresAll?: boolean) => {
      if (!code) return true
      if (!perms.includes(code)) return false
      if (requiresAll && !allScopePerms.includes(code)) return false
      return true
    }
    const editAction = schema.rowActions?.find((a) => a.kind === 'edit')
    const deleteAction = schema.rowActions?.find((a) => a.kind === 'delete')
    return {
      canAdd: Boolean(
        schema.form &&
        schema.createPerm &&
        hasPerm(schema.createPerm, schema.createRequiresAllScope),
      ),
      canEdit: Boolean(
        schema.form && editAction && hasPerm(editAction.perm, editAction.requiresAllScope),
      ),
      canDelete: Boolean(deleteAction && hasPerm(deleteAction.perm, deleteAction.requiresAllScope)),
      canBatchDelete: Boolean(schema.batchDeletePerm && hasPerm(schema.batchDeletePerm)),
      isDenied: isResourceDenied(feedbackError),
      hasAllScope: (code?: string) => (!code ? true : allScopePerms.includes(code)),
    }
  }, [allScopePerms, feedbackError, perms, schema])

  const submitSave = useCallback(
    (body: DynaRow) => {
      if (!dialog) return
      saveMutation.mutate({
        body,
        mode: dialog.mode,
        id: dialog.row ? rowIdOf(dialog.row, rowKey) : undefined,
      })
    },
    [dialog, rowKey, saveMutation],
  )

  const confirmDelete = useCallback(() => {
    if (deleting) {
      deleteMutation.mutate(rowIdOf(deleting, rowKey))
    }
  }, [deleteMutation, deleting, rowKey])

  const confirmBatchDelete = useCallback(() => {
    if (selectedKeys.length > 0) {
      batchDeleteMutation.mutate(selectedKeys)
    }
  }, [batchDeleteMutation, selectedKeys])

  const confirmToggle = useCallback(() => {
    if (!toggling) return
    const { row, action } = toggling
    const next = row[action.field] === action.onValue ? action.offValue : action.onValue
    const body = action.submitRow ? { ...row, [action.field]: next } : { [action.field]: next }
    toggleMutation.mutate({ id: rowIdOf(row, rowKey), body, action })
  }, [rowKey, toggleMutation, toggling])

  return {
    schema,
    queryScope,
    validation,
    rowKey,
    entity,
    queryKey: overviewKey,
    collection,
    filters: appliedSearch,
    draftSearch,
    setDraftSearchField,
    submitDraftSearch,
    applyFilters,
    resetFilters,
    page,
    size: pageSize,
    setPage,
    setSize: changePageSize,
    sort,
    toggleSort,
    selectedRowKey,
    selectedRow,
    selectRow: setSelectedRowKey,
    activeRowKey,
    mutatedRowKey,
    selectedKeys,
    setSelectedKeys,
    permissions,
    actions: {
      openCreate: (initialRow = null) => setDialog({ mode: 'create', row: initialRow }),
      openEdit: (row) => setDialog({ mode: 'edit', row }),
      openView: (row) => setViewing(row),
      requestDelete: (row) => setDeleting(row),
      requestBatchDelete: (keys) => {
        if (keys) setSelectedKeys(keys)
        setBatchDeleting(true)
      },
      requestToggle: (row, action, label) => setToggling({ row, action, label }),
      openImport: () => setImporting(true),
      triggerExport: () => exportMutation.mutate(undefined),
      triggerCustomAction: (actionKey, row) => {
        const handler = customActions?.[actionKey]
        if (typeof handler === 'function' && !queryScope) {
          handler(row)
        } else if (handler && typeof handler !== 'function') {
          runCustom(handler, row)
        }
      },
      retry: retryList,
      invalidate,
      renderRowActions,
    },
    dialogs: {
      dialog,
      setDialog,
      viewing,
      setViewing,
      deleting,
      setDeleting,
      toggling,
      setToggling,
      batchDeleting,
      setBatchDeleting,
      importing,
      setImporting,
      savePending: saveMutation.isPending,
      deletePending: deleteMutation.isPending,
      batchDeletePending: batchDeleteMutation.isPending,
      togglePending: toggleMutation.isPending,
      exportPending: exportMutation.isPending,
      submitSave,
      confirmDelete,
      confirmBatchDelete,
      confirmToggle,
    },
  }
}
