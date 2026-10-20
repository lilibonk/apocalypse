import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { lastDictionaryPage } from './dict-book.model'

export function DictPagination({
  page,
  total,
  size,
  disabled,
  label,
  onChange,
}: {
  page: number
  total: number
  size: number
  disabled: boolean
  label: string
  onChange: (page: number) => void
}) {
  const { t } = useTranslation('system')
  const pages = lastDictionaryPage(total, size)
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground tabular-nums">
        {t('dictBook.pageSummary', { page, pages, total })}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || page <= 1}
            onClick={() => onChange(page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            {t('dictBook.previous')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || page >= pages}
            onClick={() => onChange(page + 1)}
          >
            {t('dictBook.next')}
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </nav>
  )
}
