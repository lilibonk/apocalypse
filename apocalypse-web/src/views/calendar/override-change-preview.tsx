import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { motionTransition } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import type { DayField, DayFieldValue, EffectiveDay } from './calendar.api'
import { dayValueText } from './calendar.format'
import {
  commandValue,
  dayFieldLabels,
  snapshotField,
  type DayOverrideCommand,
} from './day-override-model'

export function OverrideChangePreview({
  day,
  operation,
  field,
  underlay,
  scope,
  preview = false,
}: {
  day: EffectiveDay
  operation: DayOverrideCommand | null
  field?: DayField
  underlay: DayFieldValue
  scope: string
  preview?: boolean
}) {
  const { t } = useTranslation('calendar')
  const animate = useMotionPreference()
  const selectedField = operation?.field ?? field
  if (!selectedField) return null
  const source = day.resolutions.find((value) => value.field === selectedField)
  const before = snapshotField(day.effective, selectedField, source?.state)
  const after = operation
    ? operation.action === 'INHERIT'
      ? underlay
      : commandValue(operation)
    : null
  return (
    <div className="space-y-3 rounded-panel border border-border p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {day.date} · {t(dayFieldLabels[selectedField])}
          {operation && <> · {t(`overrideActions.${operation.action}`)}</>}
        </p>
        {preview && <Badge variant="outline">{t('workspace.unsavedPreview')}</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-md bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">{t('overrideEditor.underlay')}</p>
          <p className="mt-2 break-words">{dayValueText(underlay)}</p>
        </div>
        <div className="min-w-0 rounded-md bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">{t('overrideEditor.before')}</p>
          <p className="mt-2 break-words">{dayValueText(before)}</p>
        </div>
        <div
          className="min-w-0 rounded-md border border-primary/30 bg-primary/5 p-3"
          aria-live="polite"
        >
          <p className="text-xs text-muted-foreground">{t('overrideEditor.after')}</p>
          <AnimatePresence initial={false}>
            <motion.p
              key={JSON.stringify([selectedField, operation?.action, after])}
              initial={animate ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={animate ? motionTransition.feedback : { duration: 0 }}
              className="mt-2 break-words font-medium text-brand-text"
            >
              {operation ? dayValueText(after) : t('workspace.previewInputRequired')}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('overrideEditor.scope')}: {scope}
      </p>
      <p className="break-all text-xs text-muted-foreground">
        {t('fieldProvenance')}: {t(`layers.${source?.source.layer ?? 'NONE'}`)}
      </p>
    </div>
  )
}
