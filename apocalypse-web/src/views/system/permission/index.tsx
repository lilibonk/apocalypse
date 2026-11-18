import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DynaDetail,
  DynaDialogs,
  DynaForm,
  DynaToolbar,
  DynaToolbarActions,
  useDynaController,
  type DynaFormProps,
} from '@/components/dyna'
import { useDynaText } from '@/components/dyna/use-dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { useEntityIntent, type EntityRouteIntent } from '@/components/navigation'
import { useAuthStore } from '@/stores/auth'

import { permissionMetadataBody } from './permission.model'
import schema from './permission.schema'
import { PermissionWorkspace } from './PermissionWorkspace'

function PermissionForm(props: DynaFormProps) {
  const { t } = useTranslation('system')
  const version = props.initialRow?.version
  const readOnly = props.initialRow?.registered !== true || props.initialRow?.lifecycle === 'LEGACY'
  const versionValid = typeof version === 'number' && Number.isInteger(version) && version >= 0
  return (
    <DynaForm
      {...props}
      config={{
        ...props.config,
        fields: props.config.fields
          .filter((field) => field.name !== 'declarationSource')
          .map((field) => ({
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
        <div className="space-y-1.5 rounded-control border border-border-subtle bg-muted/30 p-3 text-xs text-muted-foreground">
          <p>{t('permissionCatalog.editScopeNote')}</p>
          {readOnly && <p>{t('permissionCatalog.legacyReadOnly')}</p>}
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
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const { intent } = useEntityIntent('permission')
  const instanceKey = JSON.stringify([
    sessionEpoch,
    authorizationEpoch,
    intent?.id,
    intent?.label,
    intent?.moduleKey,
    intent?.resource,
  ])

  return <PermissionPageContent key={instanceKey} intent={intent ?? undefined} />
}

function PermissionPageContent({ intent }: { intent?: EntityRouteIntent }) {
  const { t } = useTranslation('system')
  const dynaText = useDynaText()
  const queryClient = useQueryClient()
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
      description: undefined,
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
                ? t('permissionCatalog.registeredStatus', { defaultValue: '声明状态' })
                : field.key === 'referenceRoleCount'
                  ? t('permissionCatalog.referenceRoleCount')
                  : fieldTitle(field.key),
        })),
      },
    }
  }, [t])

  // Stable so opening the detail does not re-render every catalog row.
  const customActions = useMemo(() => ({ 'permission-details': setDetail }), [])

  const controller = useDynaController(localized, {
    entityIntent: intent,
    customActions,
    onRefreshCompanion: (overviewKey) => {
      if (overviewKey) {
        void queryClient.invalidateQueries({ queryKey: overviewKey })
      }
    },
  })

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

  const searchControl = <DynaToolbar controller={controller} presentation="panel" />

  return (
    <>
      <div className="w-full min-w-0 space-y-5 p-4 sm:p-6">
        <PageHeader
          title={dynaText(localized.title)}
          actions={<DynaToolbarActions controller={controller} />}
        />

        <PermissionWorkspace
          controller={controller}
          collection={controller.collection}
          filters={controller.filters}
          applyFilters={controller.applyFilters}
          queryKey={controller.queryKey}
          selectedRowKey={controller.selectedRowKey}
          selectRow={controller.selectRow}
          onOpenDetails={setDetail}
          search={searchControl}
          intent={intent}
        />

        <DynaDialogs controller={controller} formComponent={PermissionForm} />
      </div>

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
