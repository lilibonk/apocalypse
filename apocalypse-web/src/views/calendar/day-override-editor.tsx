/** Shared six-field editor inside Calendar; domain-specific tagged values exceed flat CRUD fields. */
import { FieldSelect, FieldOption } from '@/components/ui/field-select'
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
        <FieldSelect
          id={`${id}-field`}
          className={selectClass}
          value={value.field}
          onValueChange={(selection) =>
            onChange({ ...value, field: selection as DayField, text: '' })
          }
        >
          {Object.entries(dayFieldLabels).map(([key, label]) => (
            <FieldOption key={key} value={key}>
              {t(label)}
            </FieldOption>
          ))}
        </FieldSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-action`}>{t('personalOverrides.action')}</Label>
        <FieldSelect
          id={`${id}-action`}
          className={selectClass}
          value={value.action}
          onValueChange={(selection) => onChange({ ...value, action: selection as OverrideAction })}
        >
          {(['SET', 'CLEAR', 'INHERIT'] as const).map((action) => (
            <FieldOption key={action} value={action}>
              {t(`overrideActions.${action}`)}
            </FieldOption>
          ))}
        </FieldSelect>
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
              <FieldSelect
                id={`${id}-zodiac`}
                className={selectClass}
                value={value.zodiac}
                onValueChange={(selection) =>
                  onChange({ ...value, zodiac: selection as DayOverrideInput['zodiac'] })
                }
              >
                {zodiacs.map((code) => (
                  <FieldOption key={code} value={code}>
                    {t(`values.${code}`)}
                  </FieldOption>
                ))}
              </FieldSelect>
            </div>
          )}
          {value.field === 'SOLAR_TERM' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-term`}>{t('solarTerm')}</Label>
              <FieldSelect
                id={`${id}-term`}
                className={selectClass}
                value={value.solarTerm}
                onValueChange={(selection) =>
                  onChange({
                    ...value,
                    solarTerm: selection as DayOverrideInput['solarTerm'],
                  })
                }
              >
                {solarTerms.map((code) => (
                  <FieldOption key={code} value={code}>
                    {t(`values.${code}`)}
                  </FieldOption>
                ))}
              </FieldSelect>
            </div>
          )}
          {value.field === 'DAY_POLICY' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-policy`}>{t('overrideEditor.classification')}</Label>
              <FieldSelect
                id={`${id}-policy`}
                className={selectClass}
                value={value.classification}
                onValueChange={(selection) =>
                  onChange({
                    ...value,
                    classification: selection as DayOverrideInput['classification'],
                  })
                }
              >
                {dayPolicies.map((code) => (
                  <FieldOption key={code} value={code}>
                    {t(`values.${code}`)}
                  </FieldOption>
                ))}
              </FieldSelect>
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
