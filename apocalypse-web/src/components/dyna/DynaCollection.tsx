import type { ReactNode } from 'react'
import { Inbox, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isResourceDenied } from '@/lib/query/use-resource-denial'
import { DynaPagination } from './DynaPagination'
import { DynaQueryFeedback } from './DynaQueryFeedback'
import type { DynaTableProps } from './DynaTable'
import { useDynaText } from './use-dyna'

/** The same feedback and paging contract as DynaTable, around page-owned object presentation. */
export function DynaCollection({
  collection,
  children,
}: {
  collection: DynaTableProps
  children: (rows: Record<string, unknown>[]) => ReactNode
}) {
  const t = useDynaText()
  const { rows, error, loading, refreshing, onRetry, filtered, onResetFilters } = collection
  const visible = rows !== undefined && !isResourceDenied(error)
  return (
    <div className="space-y-4" aria-busy={loading || refreshing}>
      <DynaQueryFeedback
        error={error}
        hasData={visible}
        refreshing={refreshing}
        onRetry={onRetry}
      />
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-32 rounded-panel" />
          ))}
        </div>
      ) : visible && rows.length > 0 ? (
        children(rows)
      ) : (
        (visible || !error) && (
          <div
            role="status"
            className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-panel border border-border-subtle bg-card p-6 text-center text-muted-foreground"
          >
            {filtered ? (
              <SearchX className="size-6" aria-hidden="true" />
            ) : (
              <Inbox className="size-6" aria-hidden="true" />
            )}
            <p className="font-medium text-foreground">
              {t(filtered ? 'queryNoMatches' : '暂无数据')}
            </p>
            <p className="text-sm">{t(filtered ? 'queryNoMatchesHint' : 'queryEmptyHint')}</p>
            {filtered && onResetFilters && (
              <Button variant="outline" size="sm" onClick={onResetFilters}>
                {t('queryClearFilters')}
              </Button>
            )}
          </div>
        )
      )}
      {!loading && visible && <DynaPagination {...collection} />}
    </div>
  )
}
