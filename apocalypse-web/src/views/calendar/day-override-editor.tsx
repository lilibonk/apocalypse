/** Shared six-field editor inside Calendar; domain-specific tagged values exceed flat CRUD fields. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { DayField, OverrideAction } from './calendar.api'
import {
  dayFieldLabels,
  dayPolicies,
  solarTerms,
  zodiacs,
  type DayOverrideInput,
} from './day-override-model'

export function DayOverrideEditor({
  value,
  onChange,
}: {
  value: DayOverrideInput
  onChange: (value: DayOverrideInput) => void
}) {
  const { t } = useTranslation('calendar')
  const id = useId()
  const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'
  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-field`}>{t('overrideEditor.field')}</Label>
        <select
          id={`${id}-field`}
          className={selectClass}
          value={value.field}
          onChange={(event) =>
            onChange({ ...value, field: event.target.value as DayField, text: '' })
          }
        >
          {Object.entries(dayFieldLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {t(label)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-action`}>{t('personalOverrides.action')}</Label>
        <select
          id={`${id}-action`}
          className={selectClass}
          value={value.action}
          onChange={(event) => onChange({ ...value, action: event.target.value as OverrideAction })}
        >
          {(['SET', 'CLEAR', 'INHERIT'] as const).map((action) => (
            <option key={action} value={action}>
              {t(`overrideActions.${action}`)}
            </option>
          ))}
        </select>
      </div>
      {value.action === 'SET' && (
        <>
          {value.field === 'LUNAR_DATE' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {(['year', 'month', 'day'] as const).map((part) => (
                  <div key={part} className="grid gap-1.5">
                    <Label htmlFor={`${id}-${part}`}>{t(`overrideEditor.${part}`)}</Label>
                    <Input
                      id={`${id}-${part}`}
                      type="number"
                      min={1}
                      max={part === 'month' ? 12 : part === 'day' ? 30 : undefined}
                      value={value[part]}
                      onChange={(event) => onChange({ ...value, [part]: event.target.value })}
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.leapMonth}
                  onChange={(event) => onChange({ ...value, leapMonth: event.target.checked })}
                />
                {t('overrideEditor.leapMonth')}
              </label>
            </>
          )}
          {value.field === 'ZODIAC' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-zodiac`}>{t('zodiac')}</Label>
              <select
                id={`${id}-zodiac`}
                className={selectClass}
                value={value.zodiac}
                onChange={(event) =>
                  onChange({ ...value, zodiac: event.target.value as DayOverrideInput['zodiac'] })
                }
              >
                {zodiacs.map((code) => (
                  <option key={code} value={code}>
                    {t(`values.${code}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {value.field === 'SOLAR_TERM' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-term`}>{t('solarTerm')}</Label>
              <select
                id={`${id}-term`}
                className={selectClass}
                value={value.solarTerm}
                onChange={(event) =>
                  onChange({
                    ...value,
                    solarTerm: event.target.value as DayOverrideInput['solarTerm'],
                  })
                }
              >
                {solarTerms.map((code) => (
                  <option key={code} value={code}>
                    {t(`values.${code}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {value.field === 'DAY_POLICY' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-policy`}>{t('overrideEditor.classification')}</Label>
              <select
                id={`${id}-policy`}
                className={selectClass}
                value={value.classification}
                onChange={(event) =>
                  onChange({
                    ...value,
                    classification: event.target.value as DayOverrideInput['classification'],
                  })
                }
              >
                {dayPolicies.map((code) => (
                  <option key={code} value={code}>
                    {t(`values.${code}`)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t('overrideEditor.localScope')}</p>
            </div>
          )}
          {['DISPLAY_LABEL', 'DISPLAY_NOTE', 'DAY_POLICY'].includes(value.field) && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-text`}>
                {value.field === 'DAY_POLICY'
                  ? t('overrideEditor.policyName')
                  : t(dayFieldLabels[value.field])}
              </Label>
              {value.field === 'DISPLAY_NOTE' ? (
                <Textarea
                  id={`${id}-text`}
                  maxLength={500}
                  value={value.text}
                  onChange={(event) => onChange({ ...value, text: event.target.value })}
                />
              ) : (
                <Input
                  id={`${id}-text`}
                  maxLength={64}
                  value={value.text}
                  onChange={(event) => onChange({ ...value, text: event.target.value })}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
