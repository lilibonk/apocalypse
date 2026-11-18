import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useDynaText } from './use-dyna'

export interface DynaPaginationProps {
  page: number
  size: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: readonly number[]
  paginated?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
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
  disabled = false,
  ariaLabel,
  className,
}: DynaPaginationProps) {
  const t = useDynaText()
  const pages = Math.max(1, Math.ceil(total / size))
  const start = total === 0 ? 0 : Math.min((page - 1) * size + 1, total)
  const end = Math.min(page * size, total)
  const sizes = Array.from(new Set([...pageSizeOptions, size])).sort((a, b) => a - b)
  const Container = ariaLabel ? 'nav' : 'div'
  return (
    <Container
      aria-label={ariaLabel}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 text-sm tabular-nums text-muted-foreground',
        className,
      )}
    >
      <span>{paginated ? t('range', { start, end, total }) : t('allRows', { total })}</span>
      {paginated && (
        <div className="flex flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:flex-initial sm:justify-end">
          <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <span>{t('每页')}</span>
            {onPageSizeChange ? (
              <Select
                disabled={disabled}
                value={String(size)}
                onValueChange={(value) => onPageSizeChange(Number(value))}
              >
                <SelectTrigger size="sm" className="w-[4.5rem]" aria-label={t('每页条数')}>
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
          <span className="hidden h-4 w-px bg-border sm:inline-block" aria-hidden="true" />
          <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              {t('上一页')}
            </Button>
            <span className="min-w-10 text-center">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || page >= pages}
              onClick={() => onPageChange(page + 1)}
            >
              {t('下一页')}
            </Button>
          </div>
        </div>
      )}
    </Container>
  )
}
