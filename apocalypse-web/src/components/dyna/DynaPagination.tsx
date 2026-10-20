import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDynaText } from './use-dyna'

export interface DynaPaginationProps {
  page: number
  size: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: readonly number[]
  paginated?: boolean
}

/** Shared range and navigation for both the field table and object workspaces. */
export function DynaPagination({
  page,
  size,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  paginated = true,
}: DynaPaginationProps) {
  const t = useDynaText()
  const pages = Math.max(1, Math.ceil(total / size))
  const start = total === 0 ? 0 : Math.min((page - 1) * size + 1, total)
  const end = Math.min(page * size, total)
  const sizes = Array.from(new Set([...pageSizeOptions, size])).sort((a, b) => a - b)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm tabular-nums text-muted-foreground">
      <span>{paginated ? t('range', { start, end, total }) : t('allRows', { total })}</span>
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
                  {sizes.map((option) => (
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
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            {t('下一页')}
          </Button>
        </div>
      )}
    </div>
  )
}
