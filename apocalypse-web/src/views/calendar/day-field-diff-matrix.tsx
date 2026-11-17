import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { DayField, EffectiveDay } from './calendar.api'
import { dayValueText } from './calendar.format'
import {
  commandValue,
  dayFieldLabels,
  snapshotField,
  underlayField,
  type DayOverrideCommand,
} from './day-override-model'
import { StateBadge } from './calendar.ui'

const ALL_DAY_FIELDS: readonly DayField[] = [
  'LUNAR_DATE',
  'ZODIAC',
  'SOLAR_TERM',
  'DAY_POLICY',
  'DISPLAY_LABEL',
  'DISPLAY_NOTE',
]

export interface DayFieldDiffMatrixProps {
  day: EffectiveDay
  scope: 'PERSONAL' | 'MANAGED'
  activeField: DayField
  operation: DayOverrideCommand | null
  onSelectField?: (field: DayField) => void
}

/**
 * 6-Field × 4-Column Interactive Provenance & Diff Matrix:
 * Columns: [字段 | 下层继承值 (Underlay) | 当前生效值 + 5层溯源 (Effective + Provenance) | 拟改值 (Proposed)]
 */
export function DayFieldDiffMatrix({
  day,
  scope,
  activeField,
  operation,
  onSelectField,
}: DayFieldDiffMatrixProps) {
  const { t } = useTranslation('calendar')

  return (
    <div
      data-slot="day-field-diff-matrix"
      className="overflow-x-auto rounded-panel border border-border-subtle bg-card"
    >
      <table className="w-full min-w-[38rem] text-left text-sm">
        <thead className="border-b border-border-subtle bg-muted/35 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-medium">{t('workspace.allFields')}</th>
            <th className="px-3 py-2.5 font-medium">{t('overrideEditor.underlay')}</th>
            <th className="px-3 py-2.5 font-medium">
              {t('effectiveValue')} · {t('fieldProvenance')}
            </th>
            <th className="px-3 py-2.5 font-medium">{t('overrideEditor.after')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {ALL_DAY_FIELDS.map((field) => {
            const isSelected = field === activeField
            const resolution = day.resolutions.find((item) => item.field === field)
            const underlayVal = dayValueText(underlayField(day, field, scope))
            const effectiveVal = dayValueText(
              snapshotField(day.effective, field, resolution?.state),
            )
            const isOverridden = underlayVal !== effectiveVal
            const isProposedTarget = operation?.field === field
            const proposedVal = isProposedTarget
              ? operation.action === 'INHERIT'
                ? underlayVal
                : dayValueText(commandValue(operation))
              : effectiveVal
            const hasProposedDiff = isProposedTarget && proposedVal !== effectiveVal

            return (
              <tr
                key={field}
                data-field={field}
                data-selected={isSelected ? 'true' : 'false'}
                onClick={() => onSelectField?.(field)}
                className={cn(
                  'transition-colors',
                  onSelectField && 'cursor-pointer hover:bg-muted/40',
                  isSelected && 'bg-primary/6',
                )}
              >
                <td className="px-3 py-2.5 font-medium">
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <span
                        className="size-2 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    )}
                    <span>{t(dayFieldLabels[field])}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  <span className={cn(isOverridden && 'draft-original')}>{underlayVal || '—'}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('font-medium', isOverridden && 'text-brand-text')}>
                      {effectiveVal || '—'}
                    </span>
                    {resolution && (
                      <Badge variant="outline" className="text-[11px]">
                        {t(`layers.${resolution.source.layer}`)}
                      </Badge>
                    )}
                    {resolution && resolution.conflictState !== 'NONE' && (
                      <StateBadge value={resolution.conflictState} />
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {isProposedTarget ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'font-medium',
                          hasProposedDiff ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {proposedVal || '—'}
                      </span>
                      <Badge variant="default" className="text-[11px]">
                        {t(`overrideActions.${operation.action}`)}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
