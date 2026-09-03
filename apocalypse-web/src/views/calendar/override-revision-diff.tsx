import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { DayOverrideItem } from './calendar.api'
import { dayValueText } from './calendar.format'
import { dayFieldLabels } from './day-override-model'

export function OverrideRevisionDiff({
  before,
  after,
}: {
  before: DayOverrideItem[]
  after: DayOverrideItem[]
}) {
  const { t } = useTranslation('calendar')
  const [limit, setLimit] = useState(50)
  const key = (item: DayOverrideItem) => `${item.date}:${item.field}`
  const old = new Map(before.map((item) => [key(item), item]))
  return (
    <div className="space-y-2">
      <p>{t('managedOverrides.itemCount', { count: after.length })}</p>
      {after.slice(0, limit).map((item) => (
        <div className="rounded-md border border-border p-2" key={key(item)}>
          <p>
            {item.date} · {t(dayFieldLabels[item.field])}
          </p>
          <p>
            {t('overrideEditor.before')}:{' '}
            {t(`overrideActions.${old.get(key(item))?.action ?? 'INHERIT'}`)} ·{' '}
            {dayValueText(
              old.get(key(item))?.action === 'INHERIT' || !old.has(key(item))
                ? item.savedUnderlay
                : old.get(key(item))?.value,
            )}
          </p>
          <p>
            {t('overrideEditor.after')}: {t(`overrideActions.${item.action}`)} ·{' '}
            {dayValueText(item.action === 'INHERIT' ? item.savedUnderlay : item.value)}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            {item.savedUnderlaySource?.sourceCalendarKey} ·{' '}
            {item.savedUnderlaySource?.sourceVersion}
          </p>
        </div>
      ))}
      {after.length > limit && (
        <Button variant="outline" onClick={() => setLimit((value) => value + 50)}>
          {t('overrideEditor.showMore')}
        </Button>
      )}
    </div>
  )
}
