/**
 * DynaTable：桌面表格 + 移动对象卡片 + 分页。
 *
 * 小于 md 时不再把桌面表格横向压缩，而是按“字段名 / 值”重排；操作区始终可见。
 * 空态允许 sleeping PixelOrb，但不再把 PixelWave 放进数据表面。
 */

import type { ReactNode } from 'react'

import { DictTag } from '@/components/DictTag'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PixelOrb } from '@/effects/PixelOrb'
import { PixelBubble } from '@/effects/registry/PixelBubble'
import { cn } from '@/lib/utils'

import type { DynaColumn } from './schema'
import { useDynaText } from './use-dyna'

export interface DynaTableProps {
  columns: DynaColumn[]
  rows: Record<string, unknown>[] | undefined
  loading: boolean
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
}

function CellValue({ column, row }: { column: DynaColumn; row: Record<string, unknown> }) {
  const raw = row[column.key]

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
  return <>{String(raw)}</>
}

function stickyColumnClass(
  column: DynaColumn,
  columns: DynaColumn[],
  hasActions: boolean,
): string | undefined {
  if (column.sticky !== 'right') return undefined
  const stickyColumns = columns.filter((item) => item.sticky === 'right')
  const indexFromRight = [...stickyColumns].reverse().findIndex((item) => item.key === column.key)
  if (indexFromRight === 0)
    return hasActions ? 'sticky right-32 z-10 w-40 min-w-40' : 'sticky right-0 z-10 w-40 min-w-40'
  return hasActions ? 'sticky right-72 z-10 w-40 min-w-40' : 'sticky right-40 z-10 w-40 min-w-40'
}

export function DynaTable({
  columns,
  rows,
  loading,
  rowKey,
  actions,
  page,
  size,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  paginated = true,
}: DynaTableProps) {
  const t = useDynaText()
  const totalPages = Math.max(1, Math.ceil(total / size))
  const hasRows = Boolean(rows?.length)
  const rangeStart = total === 0 ? 0 : (page - 1) * size + 1
  const rangeEnd = Math.min(page * size, total)
  const availablePageSizes = Array.from(new Set([...pageSizeOptions, size])).sort((a, b) => a - b)

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {loading && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        )}

        {!loading && !hasRows && (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 px-4 py-8 text-center text-muted-foreground sm:flex-row sm:text-left">
            <PixelOrb state="sleeping" size={64} />
            <PixelBubble className="m-1.5">{t('暂无数据')}</PixelBubble>
          </div>
        )}

        {!loading && hasRows && (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead
                        key={column.key}
                        className={cn(
                          stickyColumnClass(column, columns, Boolean(actions)),
                          'bg-card',
                        )}
                      >
                        {t(column.title)}
                      </TableHead>
                    ))}
                    {actions && (
                      <TableHead className="sticky right-0 z-10 w-32 bg-card text-right">
                        {t('操作')}
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows?.map((row, index) => (
                    <TableRow
                      key={(row[rowKey] as string | number | undefined) ?? index}
                      className="group"
                    >
                      {columns.map((column) => (
                        <TableCell
                          key={column.key}
                          className={cn(
                            stickyColumnClass(column, columns, Boolean(actions)),
                            column.sticky === 'right' && 'bg-card group-hover:bg-muted/50',
                          )}
                        >
                          <CellValue column={column} row={row} />
                        </TableCell>
                      ))}
                      {actions && (
                        <TableCell className="sticky right-0 z-10 bg-card text-right group-hover:bg-muted/50">
                          {actions(row)}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {rows?.map((row, index) => (
                <article
                  key={(row[rowKey] as string | number | undefined) ?? index}
                  className="space-y-3 p-4"
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
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {paginated
            ? t('range', { start: rangeStart, end: rangeEnd, total })
            : t('allRows', { total })}
        </span>
        {paginated && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2">
              <span>{t('每页')}</span>
              {onPageSizeChange ? (
                <Select
                  value={String(size)}
                  onValueChange={(value) => onPageSizeChange(Number(value))}
                >
                  <SelectTrigger size="sm" className="w-20" aria-label={t('每页条数')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePageSizes.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="font-medium text-foreground">{size}</span>
              )}
              <span>{t('条')}</span>
            </label>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              {t('上一页')}
            </Button>
            <span className="min-w-12 text-center">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              {t('下一页')}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
