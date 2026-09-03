import { useState, type ReactElement, type ReactNode } from 'react'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

/** Uses the existing accessible/focus-return/reduced-motion confirmation layer. */
export function CalendarConfirm({
  trigger,
  title,
  description,
  children,
  onConfirm,
  disabled = false,
  reviewKey,
}: {
  trigger: ReactElement
  title: string
  description: string
  children?: ReactNode
  onConfirm: () => void
  disabled?: boolean
  reviewKey?: string
}) {
  const { t } = useTranslation('calendar')
  const [reviewedKey, setReviewedKey] = useState(reviewKey)
  const changed = reviewedKey !== reviewKey
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (open) setReviewedKey(reviewKey)
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-80 space-y-3 overflow-auto text-sm">{children}</div>
        {changed && (
          <p role="alert" className="text-sm text-destructive">
            {t('overrideEditor.changed')}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t('eventEditor.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled || changed}
            onClick={() => {
              if (!changed) onConfirm()
            }}
          >
            {t('overrideEditor.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
