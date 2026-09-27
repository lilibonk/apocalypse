import { CircleAlert, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied } from '@/lib/query/use-resource-denial'

import { useDynaText } from './use-dyna'

/** A failed refresh can keep its last successful result; a denied resource never can. */
export function DynaQueryFeedback({
  error,
  hasData,
  refreshing = false,
  onRetry,
}: {
  error: unknown
  hasData: boolean
  refreshing?: boolean
  onRetry?: () => void
}) {
  const t = useDynaText()
  if (!error) return null

  const denied = isResourceDenied(error)
  const stale = hasData && !denied

  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card p-4"
    >
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">
          {t(denied ? 'queryDenied' : stale ? 'queryRefreshFailed' : 'queryFailed')}
        </p>
        <p className="break-words text-sm text-muted-foreground">
          {error instanceof ApiError ? error.message : t('queryRetryHint')}
        </p>
        {stale && <p className="text-sm text-muted-foreground">{t('queryStaleHint')}</p>}
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={refreshing}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {t(refreshing ? 'queryRetrying' : 'queryRetry')}
        </Button>
      )}
    </div>
  )
}
