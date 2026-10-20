import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/ui/date-picker'
import { FieldOption, FieldSelect } from '@/components/ui/field-select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { PermissionDefinition, ScopeOverride } from '../permission/permission.types'
import { grantInstantToWallTime, grantWallTimeToInstant, type GrantTimeZone } from './grant-time'
import { grantWindowError, type RoleGrant } from './role-grant.model'

export function RoleGrantFields({
  grant,
  definition,
  zone: controlledZone,
  onZoneChange,
  disabled,
  errors,
  onChange,
  onTimeError,
}: {
  grant: RoleGrant
  definition: PermissionDefinition | null
  zone?: GrantTimeZone
  onZoneChange?: (zone: GrantTimeZone) => void
  disabled: boolean
  errors?: Partial<Record<'validFrom' | 'validUntil', string>>
  onChange: (values: Partial<Omit<RoleGrant, 'permissionId'>>) => void
  onTimeError: (field: 'validFrom' | 'validUntil', error: string | null) => void
}) {
  const { t } = useTranslation('system')
  const id = useId()
  const [localZone, setLocalZone] = useState<GrantTimeZone>('local')
  const zone = controlledZone ?? localZone
  const setZone = onZoneChange ?? setLocalZone
  const zoneName = Intl.DateTimeFormat().resolvedOptions().timeZone
  const scopes = definition?.supportedScopeOverrides ?? []
  const windowError = grantWindowError(grant)
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-enabled`}>{t('authorization.enabled')}</Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('authorization.enabledHint')}
          </p>
        </div>
        <Switch
          id={`${id}-enabled`}
          checked={grant.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </div>
      {scopes.length > 1 ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-scope`}>{t('authorization.scope')}</Label>
          <FieldSelect
            id={`${id}-scope`}
            value={grant.scopeOverride}
            disabled={disabled}
            onValueChange={(value) => onChange({ scopeOverride: value as ScopeOverride })}
          >
            {scopes.map((scope) => (
              <FieldOption key={scope} value={scope}>
                {t(`authorization.${scope}`)}
              </FieldOption>
            ))}
          </FieldSelect>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('authorization.scopeNotApplicable')}</p>
      )}
      <div className="space-y-3 border-t pt-4">
        <h4 className="text-xs font-medium">{t('authorization.window')}</h4>
        <div className="space-y-2">
          <Label htmlFor={`${id}-zone`}>{t('authorization.timeZone')}</Label>
          <FieldSelect
            id={`${id}-zone`}
            value={zone}
            onValueChange={(value) => setZone(value as GrantTimeZone)}
          >
            <FieldOption value="local">
              {t('authorization.localZone', { zone: zoneName })}
            </FieldOption>
            <FieldOption value="UTC">UTC</FieldOption>
          </FieldSelect>
        </div>
        {(['validFrom', 'validUntil'] as const).map((field) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={`${id}-${field}`}>{t(`authorization.${field}`)}</Label>
            <DatePicker
              id={`${id}-${field}`}
              mode="datetime-local"
              value={grantInstantToWallTime(grant[field], zone)}
              disabled={disabled}
              aria-label={`${t(`authorization.${field}`)} · ${zone === 'UTC' ? 'UTC' : zoneName}`}
              onValueChange={(value) => {
                try {
                  onChange({ [field]: grantWallTimeToInstant(value, zone) })
                  onTimeError(field, null)
                } catch (error) {
                  onTimeError(
                    field,
                    error instanceof Error && error.message === 'ambiguous'
                      ? 'windowAmbiguous'
                      : 'windowInvalid',
                  )
                }
              }}
            />
            {errors?.[field] && (
              <p className="text-xs text-destructive" role="alert">
                {t(`authorization.${errors[field]}`)}
              </p>
            )}
          </div>
        ))}
        {windowError && (
          <p role="alert" className="text-xs text-destructive">
            {t(`authorization.${windowError === 'order' ? 'windowOrder' : 'windowInvalid'}`)}
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('authorization.windowHint')}
        </p>
      </div>
    </div>
  )
}
