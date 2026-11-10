/**
 * DynaTable：桌面表格 + 移动对象卡片 + 分页。
 *
 * 小于 md 时不再把桌面表格横向压缩，而是按“字段名 / 值”重排；操作区始终可见。
 * 空态、筛选无结果与错误分开表达；授权拒绝时不呈现旧数据。
 */

import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Inbox, SearchX } from 'lucide-react'
import { toast } from 'sonner'

import { DictTag } from '@/components/DictTag'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { isResourceDenied } from '@/lib/query/use-resource-denial'

import { DynaQueryFeedback } from './DynaQueryFeedback'
import { DynaPagination } from './DynaPagination'
import type { DynaColumn } from './schema'
import type { DynaSortState } from './use-dyna-url-state'
import { useDynaText } from './use-dyna'

export interface DynaTableProps {
  columns: DynaColumn[]
  rows: Record<string, unknown>[] | undefined
  loading: boolean
  error?: unknown
  refreshing?: boolean
  onRetry?: () => void
  filtered?: boolean
  onResetFilters?: () => void
  emptyText?: string
  rowKey: string
  actions?: (row: Record<string, unknown>) => ReactNode
  page: number
  size: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: readonly number[]
  /** 树或实时全量接口设为 false，只展示总数，不伪造分页。 */
  paginated?: boolean
  /** Row (by `rowKey`) whose detail Sheet is open; it keeps a stable highlight until it closes. */
  activeRowKey?: string | null
  /** Row (by `rowKey`) that was just created, edited, or toggled; triggers the fluid row pulse (FE-W2 P4). */
  mutatedRowKey?: string | null
  /** 当前激活的列排序状态（FE-W5 M4）。 */
  sort?: DynaSortState | null
  onSortChange?: (field: string) => void
  /** 是否开启行多选（FE-W6 M3 批量操作）。 */
  selectable?: boolean
  selectedKeys?: readonly string[]
  onSelectedKeysChange?: (keys: string[]) => void
}

function CellValue({ column, row }: { column: DynaColumn; row: Record<string, unknown> }) {
  const t = useDynaText()
  const raw = row[column.key]

  const content = (() => {
    if (column.type === 'dict' && column.dictType) {
      return <DictTag type={column.dictType} value={raw as string | number | null | undefined} />
    }
    if (raw === null || raw === undefined || raw === '') {
      return <span className="text-muted-foreground">-</span>
    }
    if (column.type === 'datetime') {
      return (
        <span className="text-muted-foreground">{String(raw).replace('T', ' ').slice(0, 19)}</span>
      )
    }
    if (column.options) {
      const option = column.options.find((option) => option.value === String(raw))
      if (!option) return <>{t('unknownOption')}</>
      if (!option.tone) return <>{t(option.label)}</>
      return (
        <Badge variant={option.tone}>
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {t(option.label)}
        </Badge>
      )
    }
    return <>{String(raw)}</>
  })()

  if (!column.copyable || raw === null || raw === undefined || raw === '') {
    return content
  }

  const rawText = String(raw)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{content}</span>
      <button
        type="button"
        data-slot="cell-copy-button"
        aria-label={`${t('copy')} ${rawText}`}
        className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation()
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(rawText)
          }
          toast.success(t('copied'))
        }}
      >
        <Copy className="size-3" aria-hidden="true" />
      </button>
    </span>
  )
}

/** Right offsets of frozen columns, 0 = rightmost; literal class names so Tailwind emits them. */
const FROZEN_RIGHT = [
  'right-0',
  'right-(--frozen-offset-1)',
  'right-(--frozen-offset-2)',
  'right-(--frozen-offset-3)',
] as const

/** Frozen (right-sticky) order from the right edge: the actions column first, then sticky data. */
function frozenIndex(column: DynaColumn, columns: DynaColumn[], hasActions: boolean) {
  if (column.sticky !== 'right') return null
  const sticky = columns.filter((item) => item.sticky === 'right')
  return (
    sticky.length - 1 - sticky.findIndex((item) => item.key === column.key) + (hasActions ? 1 : 0)
  )
}

function frozenClass(index: number | null) {
  return index === null ? undefined : cn('sticky z-10', FROZEN_RIGHT[index])
}

/**
 * Frozen columns take their right offsets from the measured widths of the frozen header cells
 * (content decides the widths, so fixed offsets drifted into gaps or overlaps). Also reports
 * whether scrolled content currently sits beneath them, which shows the frozen-edge shadow.
 */
function useFrozenColumns(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [overlapping, setOverlapping] = useState(false)
  useLayoutEffect(() => {
    const wrapper = ref.current
    const container = wrapper?.querySelector<HTMLElement>('[data-slot="table-container"]')
    if (!enabled || !wrapper || !container) return
    const heads = () =>
      [...container.querySelectorAll<HTMLElement>('thead th[data-frozen]')].sort(
        (a, b) => Number(a.dataset.frozen) - Number(b.dataset.frozen),
      )
    const measure = () => {
      let offset = 0
      heads().forEach((head, index) => {
        if (index > 0) wrapper.style.setProperty(`--frozen-offset-${index}`, `${offset}px`)
        offset += head.getBoundingClientRect().width
      })
      setOverlapping(container.scrollLeft + container.clientWidth < container.scrollWidth - 1)
    }
    // ResizeObserver reports once on observe (before paint) and again on any width change.
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    const table = container.querySelector('table')
    if (table) observer.observe(table)
    heads().forEach((head) => observer.observe(head))
    container.addEventListener('scroll', measure, { passive: true })
    return () => {
      container.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [enabled])
  return [ref, enabled && overlapping] as const
}

// Table cells ignore box-shadow in the collapsed border model; a gradient pseudo-element shades
// the edge instead (the sticky cell is its containing block).
function frozenEdge(shown: boolean) {
  return (
    shown &&
    "before:pointer-events-none before:absolute before:inset-y-0 before:-left-3 before:w-3 before:bg-linear-to-l before:from-(--table-frozen-shade) before:to-transparent before:content-['']"
  )
}

/** One desktop row; memoised so a highlight or layer change re-renders only the affected row. */
const DynaTableRow = memo(function DynaTableRow({
  row,
  rowKeyValue,
  columns,
  actions,
  frozenEdgeKey,
  frozenOverlap,
  active,
  mutated,
  selectable,
  selected,
  onToggleSelect,
}: {
  row: Record<string, unknown>
  rowKeyValue: string
  columns: DynaColumn[]
  actions: DynaTableProps['actions']
  frozenEdgeKey: string | null
  frozenOverlap: boolean
  active: boolean
  mutated: boolean
  selectable: boolean
  selected: boolean
  onToggleSelect?: (key: string) => void
}) {
  const t = useDynaText()
  const hasActions = Boolean(actions)
  const actionsFrozen = hasActions ? 0 : null
  return (
    <TableRow
      className="group [&>td:first-child]:font-medium"
      data-origin-active={active ? '' : undefined}
      data-mutated-pulse={mutated ? 'true' : undefined}
      data-just-mutated={mutated ? 'true' : undefined}
    >
      {selectable && (
        <TableCell className="w-10">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`${t('selectRow')} ${rowKeyValue}`}
            className="size-4 rounded border-border accent-primary"
            onChange={() => onToggleSelect?.(rowKeyValue)}
          />
        </TableCell>
      )}
      {columns.map((column) => (
        <TableCell
          key={column.key}
          className={cn(
            frozenClass(frozenIndex(column, columns, hasActions)),
            column.sticky === 'right' && 'w-40 min-w-40 bg-card group-hover:bg-muted/50',
            frozenEdge(column.key === frozenEdgeKey && frozenOverlap),
          )}
        >
          <CellValue column={column} row={row} />
        </TableCell>
      ))}
      {actions && (
        <TableCell
          className={cn(
            frozenClass(actionsFrozen),
            'bg-card text-right group-hover:bg-muted/50',
            frozenEdge(frozenEdgeKey === null && frozenOverlap),
          )}
        >
          <div className="flex items-center justify-end gap-1">{actions(row)}</div>
        </TableCell>
      )}
    </TableRow>
  )
})

/** One narrow-screen object card; memoised like the desktop row. */
const DynaTableCard = memo(function DynaTableCard({
  row,
  columns,
  actions,
  mutated,
}: {
  row: Record<string, unknown>
  columns: DynaColumn[]
  actions: DynaTableProps['actions']
  mutated: boolean
}) {
  const t = useDynaText()
  return (
    <article
      className="space-y-3 p-4"
      data-mutated-pulse={mutated ? 'true' : undefined}
      data-just-mutated={mutated ? 'true' : undefined}
    >
      <dl className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-3 gap-y-2 text-sm">
        {columns.map((column) => (
          <div key={column.key} className="contents">
            <dt className="text-muted-foreground">{t(column.title)}</dt>
            <dd className="min-w-0 break-words text-right">
              <CellValue column={column} row={row} />
            </dd>
          </div>
        ))}
      </dl>
      {actions && (
        <div className="flex min-h-9 items-center justify-end border-t border-border pt-2">
          {actions(row)}
        </div>
      )}
    </article>
  )
})

/**
 * Memoised: pages keep their dialog/sheet state beside the table, and opening a layer must not
 * re-render every row in the same frame its animation starts. Pass stable callbacks.
 */
export const DynaTable = memo(function DynaTable({
  columns,
  rows,
  loading,
  error,
  refreshing = false,
  onRetry,
  filtered = false,
  onResetFilters,
  emptyText,
  rowKey,
  actions,
  page,
  size,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  paginated = true,
  activeRowKey = null,
  mutatedRowKey = null,
  sort = null,
  onSortChange,
  selectable = false,
  selectedKeys = [],
  onSelectedKeysChange,
}: DynaTableProps) {
  const t = useDynaText()
  const canShowData = rows !== undefined && !isResourceDenied(error)
  const hasRows = canShowData && Boolean(rows?.length)
  const hasActions = Boolean(actions)
  // The leftmost frozen column carries the edge: the first sticky data column, else the actions.
  const frozenEdgeKey = columns.find((column) => column.sticky === 'right')?.key ?? null
  const [frozenRef, frozenOverlap] = useFrozenColumns(
    Boolean(frozenEdgeKey || actions) && hasRows && !loading,
  )
  const edge = (isEdge: boolean) => frozenEdge(isEdge && frozenOverlap)
  const actionsFrozen = hasActions ? 0 : null

  const selectedSet = new Set(selectedKeys)
  const pageRowKeys = (rows ?? []).map((row, idx) => String(row[rowKey] ?? idx))
  const allPageSelected = pageRowKeys.length > 0 && pageRowKeys.every((key) => selectedSet.has(key))

  const handleToggleRow = (key: string) => {
    if (!onSelectedKeysChange) return
    if (selectedSet.has(key)) {
      onSelectedKeysChange(selectedKeys.filter((item) => item !== key))
    } else {
      onSelectedKeysChange([...selectedKeys, key])
    }
  }

  const handleToggleAll = () => {
    if (!onSelectedKeysChange) return
    if (allPageSelected) {
      const pageSet = new Set(pageRowKeys)
      onSelectedKeysChange(selectedKeys.filter((item) => !pageSet.has(item)))
    } else {
      const merged = new Set([...selectedKeys, ...pageRowKeys])
      onSelectedKeysChange([...merged])
    }
  }

  return (
    <>
      <DynaQueryFeedback
        error={error}
        hasData={canShowData}
        refreshing={refreshing}
        onRetry={onRetry}
      />
      {(loading || canShowData || !error) && (
        <div
          className="overflow-hidden rounded-panel border border-border-subtle bg-card shadow-surface"
          aria-busy={refreshing || loading}
        >
          {loading && (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          )}

          {!loading && !hasRows && (canShowData || !error) && (
            <div
              role="status"
              className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 py-10 text-center text-muted-foreground"
            >
              <div className="grid size-10 place-items-center rounded-xl bg-muted">
                {filtered ? (
                  <SearchX className="size-5" aria-hidden="true" />
                ) : (
                  <Inbox className="size-5" aria-hidden="true" />
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {t(filtered ? 'queryNoMatches' : (emptyText ?? '暂无数据'))}
                </p>
                <p className="text-sm">{t(filtered ? 'queryNoMatchesHint' : 'queryEmptyHint')}</p>
                {filtered && onResetFilters && (
                  <Button variant="outline" size="sm" onClick={onResetFilters}>
                    {t('queryClearFilters')}
                  </Button>
                )}
              </div>
            </div>
          )}

          {!loading && hasRows && (
            <>
              <div className="hidden md:block" ref={frozenRef}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectable && (
                        <TableHead className="w-10 bg-(--table-head)">
                          <input
                            type="checkbox"
                            checked={allPageSelected}
                            aria-label={t('selectAllRows')}
                            className="size-4 rounded border-border accent-primary"
                            onChange={handleToggleAll}
                          />
                        </TableHead>
                      )}
                      {columns.map((column) => {
                        const isSorted = sort?.field === column.key
                        const ariaSort = isSorted
                          ? sort?.order === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : column.sortable
                            ? 'none'
                            : undefined
                        return (
                          <TableHead
                            key={column.key}
                            aria-sort={ariaSort}
                            data-frozen={frozenIndex(column, columns, hasActions) ?? undefined}
                            className={cn(
                              frozenClass(frozenIndex(column, columns, hasActions)),
                              column.sticky === 'right' && 'w-40 min-w-40',
                              'bg-(--table-head)',
                              edge(column.key === frozenEdgeKey),
                            )}
                          >
                            {column.sortable && onSortChange ? (
                              <button
                                type="button"
                                data-slot="column-sort-button"
                                className="inline-flex items-center gap-1 font-medium text-foreground transition-colors hover:text-primary"
                                onClick={() => onSortChange(column.key)}
                              >
                                <span>{t(column.title)}</span>
                                {isSorted ? (
                                  sort?.order === 'asc' ? (
                                    <ArrowUp className="size-3.5 text-primary" aria-hidden="true" />
                                  ) : (
                                    <ArrowDown
                                      className="size-3.5 text-primary"
                                      aria-hidden="true"
                                    />
                                  )
                                ) : (
                                  <ArrowUpDown
                                    className="size-3.5 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                )}
                              </button>
                            ) : (
                              t(column.title)
                            )}
                          </TableHead>
                        )
                      })}
                      {actions && (
                        <TableHead
                          data-frozen={actionsFrozen ?? undefined}
                          className={cn(
                            frozenClass(actionsFrozen),
                            'w-32 bg-(--table-head) text-right',
                            edge(frozenEdgeKey === null),
                          )}
                        >
                          {t('操作')}
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows?.map((row, index) => {
                      const keyStr = String((row[rowKey] as string | number | undefined) ?? index)
                      return (
                        <DynaTableRow
                          key={keyStr}
                          row={row}
                          rowKeyValue={keyStr}
                          columns={columns}
                          actions={actions}
                          frozenEdgeKey={frozenEdgeKey}
                          frozenOverlap={frozenOverlap}
                          active={activeRowKey !== null && keyStr === activeRowKey}
                          mutated={mutatedRowKey !== null && keyStr === mutatedRowKey}
                          selectable={selectable}
                          selected={selectedSet.has(keyStr)}
                          onToggleSelect={handleToggleRow}
                        />
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="divide-y divide-border md:hidden">
                {rows?.map((row, index) => {
                  const keyStr = String((row[rowKey] as string | number | undefined) ?? index)
                  return (
                    <DynaTableCard
                      key={keyStr}
                      row={row}
                      columns={columns}
                      actions={actions}
                      mutated={mutatedRowKey !== null && keyStr === mutatedRowKey}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {!loading && canShowData && (
        <DynaPagination
          page={page}
          size={size}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={pageSizeOptions}
          paginated={paginated}
        />
      )}
    </>
  )
})
