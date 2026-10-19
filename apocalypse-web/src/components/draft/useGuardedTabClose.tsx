import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDraftStore } from '@/stores/drafts'

interface Pending {
  routes: string[]
  count: number
  perform: () => void
}

/**
 * Closing tabs discards the in-memory drafts of their routes, so ask first when any exists.
 * Routes without drafts close immediately; the tab store's own rules stay unchanged.
 */
export function useGuardedTabClose() {
  const { t } = useTranslation()
  const [pending, setPending] = useState<Pending | null>(null)
  const request = (routes: readonly string[], perform: () => void) => {
    const count = routes.reduce((sum, route) => sum + useDraftStore.getState().countFor(route), 0)
    if (count === 0) {
      perform()
      return
    }
    setPending({ routes: [...routes], count, perform })
  }
  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('draft.closeTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('draft.closeHint', { count: pending?.count ?? 0 })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('draft.keepEditing')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!pending) return
              useDraftStore.getState().clearRoutes(pending.routes)
              pending.perform()
              setPending(null)
            }}
          >
            {t('draft.discardAndClose')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { request, dialog }
}
