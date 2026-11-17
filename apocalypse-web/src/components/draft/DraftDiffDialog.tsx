import { useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'

import { SketchBox } from '@/components/motion'
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

/** Review of pending changes before saving; `anchor="bottom-bar"` opens as a luminous non-modal popover docked above DraftBar (CT-07). */
export function DraftDiffDialog({
  open,
  items,
  onOpenChange,
  anchor = 'center',
}: {
  open: boolean
  items: readonly DraftDiffItem[]
  onOpenChange: (open: boolean) => void
  anchor?: 'center' | 'bottom-bar'
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const descId = useId()
  const empty = t('draft.emptyValue')

  useEffect(() => {
    if (!open || anchor !== 'bottom-bar') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [anchor, onOpenChange, open])

  const diffList = (
    <ul className="max-h-[52vh] space-y-2.5 overflow-y-auto pr-1">
      {items.map((item) => (
        <li
          key={item.key}
          className="rounded-control border border-border-subtle bg-card/85 p-3 shadow-xs"
        >
          <p className="text-sm font-medium break-words">{item.label}</p>
          <p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">{item.key}</p>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t('draft.before')}</dt>
              <dd className="draft-original mt-1">{item.before ?? empty}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('draft.after')}</dt>
              <dd className="mt-1 break-all font-medium text-brand-text">{item.after ?? empty}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )

  if (anchor === 'bottom-bar') {
    if (!open) return null
    return (
      <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 sm:bottom-24">
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={descId}
          data-anchor="bottom-bar"
          className="w-full max-w-2xl"
        >
          <SketchBox
            seed={47}
            wash="normal"
            className="border-brand-text/30 bg-card/95 p-5 shadow-floating"
          >
            <div className="space-y-3">
              <div>
                <h2 id={titleId} className="text-base font-semibold text-foreground">
                  {t('draft.reviewTitle')}
                </h2>
                <p id={descId} className="mt-0.5 text-xs text-muted-foreground">
                  {t('draft.reviewHint', { count: items.length })}
                </p>
              </div>
              {diffList}
              <div className="flex justify-end border-t border-border-subtle pt-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {t('draft.closeReview')}
                </Button>
              </div>
            </div>
          </SketchBox>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-anchor={anchor} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('draft.reviewTitle')}</DialogTitle>
          <DialogDescription>{t('draft.reviewHint', { count: items.length })}</DialogDescription>
        </DialogHeader>
        {diffList}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('draft.closeReview')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
