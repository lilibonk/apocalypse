import { useTranslation } from 'react-i18next'
import type { DayFieldValue, EffectiveDay } from './calendar.api'
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
  underlay,
  scope,
}: {
  day: EffectiveDay
  operation: DayOverrideCommand
  underlay: DayFieldValue
  scope: string
}) {
  const { t } = useTranslation('calendar')
  const source = day.resolutions.find((value) => value.field === operation.field)
  const before = snapshotField(day.effective, operation.field, source?.state)
  const after = operation.action === 'INHERIT' ? underlay : commandValue(operation)
  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="font-medium">
        {day.date} · {t(dayFieldLabels[operation.field])} ·{' '}
        {t(`overrideActions.${operation.action}`)}
      </p>
      <p>
        {t('overrideEditor.scope')}: {scope}
      </p>
      <p>
        {t('overrideEditor.before')}: {dayValueText(before)}
      </p>
      <p>
        {t('overrideEditor.after')}: {dayValueText(after)}
      </p>
      <p>
        {t('overrideEditor.underlay')}: {dayValueText(underlay)}
      </p>
      <p className="break-all text-xs text-muted-foreground">
        {t('fieldProvenance')}: {source?.source.layer} · {source?.source.sourceCalendarKey} ·{' '}
        {source?.source.sourceVersion}
      </p>
    </div>
  )
}
