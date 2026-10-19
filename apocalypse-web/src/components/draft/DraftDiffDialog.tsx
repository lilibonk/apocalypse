import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import './draft.css'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface DraftDiffItem {
  key: string
  label: string
  before: string | null
  after: string | null
}

/** Review of pending changes before saving; values are shown verbatim. */
export function DraftDiffDialog({
  open,
  items,
  onOpenChange,
}: {
  open: boolean
  items: readonly DraftDiffItem[]
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const empty = t('draft.emptyValue')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('draft.reviewTitle')}</DialogTitle>
          <DialogDescription>{t('draft.reviewHint', { count: items.length })}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
          {items.map((item) => (
            <li key={item.key} className="rounded-control border border-border-subtle p-3">
              <p className="text-sm font-medium break-words">{item.label}</p>
              <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{item.key}</p>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('draft.before')}</dt>
                  <dd className="draft-original mt-1">{item.before ?? empty}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('draft.after')}</dt>
                  <dd className="mt-1 break-all">{item.after ?? empty}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('draft.closeReview')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
