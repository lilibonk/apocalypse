import { useCallback, useLayoutEffect, useState } from 'react'

import { useTabsStore } from '@/stores/tabs'

import type { DynaSearchField } from './schema'

export interface DynaSortState {
  field: string
  order: 'asc' | 'desc'
}

export function expandSearchFieldKeys(fields: readonly DynaSearchField[] | undefined): string[] {
  if (!fields || fields.length === 0) return []
  const keys: string[] = []
  for (const field of fields) {
    keys.push(field.name)
    if (field.type === 'date-range') {
      const [beginKey, endKey] = field.rangeKeys ?? [`${field.name}Begin`, `${field.name}End`]
      keys.push(beginKey, endKey)
    } else if (field.type === 'number-range') {
      const [minKey, maxKey] = field.rangeKeys ?? [`${field.name}Min`, `${field.name}Max`]
      keys.push(minKey, maxKey)
    }
  }
  return keys
}

export interface ParsedDynaUrlState {
  page: number
  pageSize: number
  search: Record<string, string>
  sort: DynaSortState | null
}

const RESERVED_KEYS = new Set([
  'page',
  'size',
  'sortField',
  'sortOrder',
  'view',
  'roleView',
  'deptView',
])

export function parseDynaUrlSearch(
  rawSearch: string,
  defaultPageSize: number,
  allowedSearchFields?: readonly string[],
  fallbackFilters?: Record<string, string>,
): ParsedDynaUrlState {
  const params = new URLSearchParams(rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch)
  const rawPage = Number(params.get('page'))
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1

  const rawSize = Number(params.get('size'))
  const pageSize =
    Number.isInteger(rawSize) && rawSize >= 1 && rawSize <= 200 ? rawSize : defaultPageSize

  const sortField = params.get('sortField')?.trim() ?? ''
  const sortOrder = params.get('sortOrder')
  const sort: DynaSortState | null =
    sortField && (sortOrder === 'asc' || sortOrder === 'desc')
      ? { field: sortField, order: sortOrder }
      : null

  const search: Record<string, string> = { ...(fallbackFilters ?? {}) }
  const allowedSet = allowedSearchFields ? new Set(allowedSearchFields) : null
  params.forEach((value, key) => {
    if (RESERVED_KEYS.has(key)) return
    if (allowedSet && !allowedSet.has(key)) return
    if (value.trim() !== '') {
      search[key] = value
    }
  })

  return { page, pageSize, search, sort }
}

export function serializeDynaUrlSearch(
  currentSearch: string,
  state: ParsedDynaUrlState,
  defaultPageSize: number,
  managedSearchKeys: readonly string[],
): string {
  const params = new URLSearchParams(
    currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch,
  )
  // Clear managed keys first while preserving unrelated view parameters (e.g., view=overview)
  params.delete('page')
  params.delete('size')
  params.delete('sortField')
  params.delete('sortOrder')
  for (const key of managedSearchKeys) {
    params.delete(key)
  }
  for (const [key, value] of Object.entries(state.search)) {
    params.delete(key)
    if (value.trim() !== '') {
      params.set(key, value)
    }
  }
  if (state.page > 1) {
    params.set('page', String(state.page))
  }
  if (state.pageSize !== defaultPageSize) {
    params.set('size', String(state.pageSize))
  }
  if (state.sort) {
    params.set('sortField', state.sort.field)
    params.set('sortOrder', state.sort.order)
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

/**
 * DynaPage URL 与多页签状态同步（FE-W3）：
 * - 顶层页面（embedded=false）自动从 URL searchParams 或当前 Tab 快照恢复分页、搜索与排序；
 * - 状态变更时同步写回 window.history.replaceState 与 useTabsStore 快照池；
 * - 仅使用 useState / useCallback / useLayoutEffect，兼容无 Router 的纯函数单测环境。
 */
export function useDynaUrlState(options: {
  embedded: boolean
  defaultPageSize: number
  searchFieldNames: readonly string[]
  entryFilters?: Record<string, string>
}) {
  const { embedded, defaultPageSize, searchFieldNames, entryFilters } = options

  const readInitial = (): ParsedDynaUrlState => {
    if (embedded || typeof window === 'undefined') {
      return {
        page: 1,
        pageSize: defaultPageSize,
        search: { ...(entryFilters ?? {}) },
        sort: null,
      }
    }
    const pathname = window.location.pathname
    const rawSearch = window.location.search || useTabsStore.getState().getTabSearch(pathname) || ''
    return parseDynaUrlSearch(rawSearch, defaultPageSize, searchFieldNames, entryFilters)
  }

  const [initial] = useState<ParsedDynaUrlState>(readInitial)
  const [page, setPage] = useState<number>(initial.page)
  const [pageSize, setPageSize] = useState<number>(initial.pageSize)
  const [draftSearch, setDraftSearch] = useState<Record<string, string>>(initial.search)
  const [appliedSearch, setAppliedSearch] = useState<Record<string, string>>(initial.search)
  const [sort, setSort] = useState<DynaSortState | null>(initial.sort)

  useLayoutEffect(() => {
    if (embedded || typeof window === 'undefined') return
    const pathname = window.location.pathname
    const nextSearch = serializeDynaUrlSearch(
      window.location.search,
      { page, pageSize, search: appliedSearch, sort },
      defaultPageSize,
      searchFieldNames,
    )
    useTabsStore.getState().setTabSearch(pathname, nextSearch)
    if (
      window.location.search !== nextSearch &&
      typeof window.history?.replaceState === 'function'
    ) {
      const nextUrl = `${pathname}${nextSearch}${window.location.hash ?? ''}`
      window.history.replaceState(window.history.state, '', nextUrl)
    }
  }, [embedded, page, pageSize, appliedSearch, sort, defaultPageSize, searchFieldNames])

  const toggleSort = useCallback((field: string) => {
    setPage(1)
    setSort((current) => {
      if (!current || current.field !== field) return { field, order: 'asc' }
      if (current.order === 'asc') return { field, order: 'desc' }
      return null
    })
  }, [])

  return {
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
  }
}
