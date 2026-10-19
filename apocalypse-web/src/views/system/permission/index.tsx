import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DynaPage } from '@/components/dyna'
import { DynaForm, type DynaFormProps } from '@/components/dyna/DynaForm'
import { useAuthStore } from '@/stores/auth'
import schema from './permission.schema'
import { DynaDetail } from '@/components/dyna/DynaDetail'
import { permissionMetadataBody } from './permission.model'
import { PermissionInsights } from './PermissionInsights'

function PermissionForm(props: DynaFormProps) {
  const { t } = useTranslation('system')
  const version = props.initialRow?.version
  const readOnly = props.initialRow?.registered !== true || props.initialRow?.lifecycle === 'LEGACY'
  const versionValid = typeof version === 'number' && Number.isInteger(version) && version >= 0
  const supports = Array.isArray(props.initialRow?.supportedScopeOverrides)
    ? props.initialRow.supportedScopeOverrides
    : []
  return (
    <DynaForm
      {...props}
      config={{
        ...props.config,
        fields: props.config.fields.map((field) => ({
          ...field,
          disabledInEdit: readOnly || field.disabledInEdit,
          options:
            field.name === 'lifecycle' && !readOnly
              ? field.options?.filter((option) => option.value !== 'LEGACY')
              : field.options,
        })),
      }}
      submitDisabled={props.submitDisabled || !versionValid || readOnly}
      onSubmit={(body) => props.onSubmit(permissionMetadataBody(body, version))}
      feedback={
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
          <p>{t(readOnly ? 'permissionCatalog.legacyReadOnly' : 'permissionCatalog.metadata')}</p>
          <p>
            {t('permissionCatalog.impact', {
              count: String(props.initialRow?.referenceRoleCount ?? '—'),
            })}
          </p>
          <p>
            {t('permissionCatalog.supportedScopes')}:{' '}
            {supports.length
              ? supports.map((scope) => t(`authorization.${String(scope)}`)).join(' · ')
              : t('permissionCatalog.noScopes')}
          </p>
          {!versionValid && (
            <p role="alert" className="text-destructive">
              {t('permissionCatalog.missingVersion')}
            </p>
          )}
        </div>
      }
    />
  )
}

export default function PermissionPage() {
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  return <PermissionPageContent key={epoch} />
}
function PermissionPageContent() {
  const { t } = useTranslation('system')
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const localized = useMemo(() => {
    const fieldTitle = (key: string) =>
      key === 'description' ? t('permissionCatalog.descriptionField') : t(`authorization.${key}`)
    // Localize labels while keeping each option's schema-defined value and chip tone.
    const options = (key: string) =>
      key === 'status' || key === 'lifecycle'
        ? schema.columns
            .find((column) => column.key === key)
            ?.options?.map((option) => ({
              ...option,
              label: t(
                key === 'status'
                  ? option.value === '1'
                    ? 'authorization.active'
                    : 'authorization.inactive'
                  : `authorization.${option.value}`,
              ),
            }))
        : undefined
    return {
      ...schema,
      title: t('permissionCatalog.title'),
      description: t('permissionCatalog.description'),
      entityName: t('permissionCatalog.entity'),
      rowActions: schema.rowActions?.map((action) =>
        action.kind === 'custom' ? { ...action, label: t('permissionCatalog.details') } : action,
      ),
      search: schema.search?.map((field) => ({
        ...field,
        label: field.name === 'keyword' ? t('permissionCatalog.keyword') : fieldTitle(field.name),
        placeholder:
          field.name === 'keyword'
            ? t('permissionCatalog.keywordPlaceholder')
            : field.name === 'moduleKey'
              ? t('permissionCatalog.modulePlaceholder')
              : field.name === 'resource'
                ? t('permissionCatalog.resourcePlaceholder')
                : field.placeholder,
        options: options(field.name),
      })),
      columns: schema.columns.map((column) => ({
        ...column,
        title: fieldTitle(column.key),
        options: options(column.key),
      })),
      form: {
        ...schema.form!,
        editTitle: t('permissionCatalog.edit'),
        fields: schema.form!.fields.map((field) => ({
          ...field,
          label: fieldTitle(field.name),
          options: options(field.name),
        })),
      },
      detail: {
        ...schema.detail!,
        title: t('permissionCatalog.details'),
        fields: schema.detail!.fields!.map((field) => ({
          ...field,
          options: options(field.key),
          title:
            field.key === 'supportedScopesDisplay'
              ? t('permissionCatalog.supportedScopes')
              : field.key === 'registeredDisplay'
                ? t('authorization.declarationSource')
                : field.key === 'referenceRoleCount'
                  ? t('permissionCatalog.referenceRoleCount')
                  : fieldTitle(field.key),
        })),
      },
    }
  }, [t])
  // Stable so opening the detail does not re-render every catalog row.
  const customActions = useMemo(() => ({ 'permission-details': setDetail }), [])
  const scopes = Array.isArray(detail?.supportedScopeOverrides)
    ? detail.supportedScopeOverrides
    : []
  const detailRecord = detail
    ? {
        ...detail,
        supportedScopesDisplay: scopes.length
          ? scopes.map((scope) => t(`authorization.${String(scope)}`)).join(' · ')
          : t('permissionCatalog.noScopes'),
        registeredDisplay: t(
          detail.registered ? 'permissionCatalog.registered' : 'permissionCatalog.notRegistered',
        ),
      }
    : null
  return (
    <>
      <DynaPage
        schema={localized}
        formComponent={PermissionForm}
        customActions={customActions}
        overview={(controls) => <PermissionInsights {...controls} />}
      />
      <DynaDetail
        title={localized.detail.title}
        description={t('permissionCatalog.metadata')}
        fields={localized.detail.fields}
        record={detailRecord}
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
      />
    </>
  )
}
