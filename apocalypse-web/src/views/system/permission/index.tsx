import { useQueryClient } from '@tanstack/react-query'
import { LayoutDashboard, List } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DynaDetail,
  DynaDialogs,
  DynaForm,
  DynaTable,
  DynaToolbar,
  DynaToolbarActions,
  useDynaController,
  type DynaFormProps,
} from '@/components/dyna'
import { useDynaText } from '@/components/dyna/use-dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { LivingContextBar, useEntityIntent, type EntityRouteIntent } from '@/components/navigation'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'
import { useAuthStore } from '@/stores/auth'

import { permissionMetadataBody } from './permission.model'
import schema from './permission.schema'
import { PermissionWorkspace } from './PermissionWorkspace'

type PermissionPageView = 'workspace' | 'list'
const PERMISSION_PAGE_VIEWS = ['workspace', 'list'] as const

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
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const { intent } = useEntityIntent('permission')
  const desktop = useDesktopViewport()
  const [view, setView] = usePageView<PermissionPageView>(PERMISSION_PAGE_VIEWS)
  const activeView: PermissionPageView = desktop ? view : 'list'
  const instanceKey = JSON.stringify([
    sessionEpoch,
    authorizationEpoch,
    intent?.id,
    intent?.label,
    intent?.moduleKey,
    intent?.resource,
  ])

  return (
    <PermissionPageContent
      key={instanceKey}
      intent={intent ?? undefined}
      view={activeView}
      onViewChange={desktop ? setView : undefined}
    />
  )
}

function PermissionPageContent({
  intent,
  view,
  onViewChange,
}: {
  intent?: EntityRouteIntent
  view: PermissionPageView
  onViewChange?: (view: PermissionPageView) => void
}) {
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

  const viewControl = onViewChange ? (
    <SegmentedControl
      label={dynaText('pageView')}
      value={view}
      onChange={onViewChange}
      options={[
        { value: 'workspace', label: dynaText('viewWorkspace'), icon: LayoutDashboard },
        { value: 'list', label: dynaText('viewList'), icon: List },
      ]}
    />
  ) : undefined

  const searchControl = (
    <DynaToolbar
      controller={controller}
      presentation={view === 'workspace' ? 'toolbar' : 'panel'}
    />
  )

  return (
    <>
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
        <PageHeader
          title={dynaText(localized.title)}
          description={localized.description ? dynaText(localized.description) : undefined}
          view={viewControl}
          actions={<DynaToolbarActions controller={controller} />}
        />

        {view === 'workspace' ? (
          <PermissionWorkspace
            controller={controller}
            collection={controller.collection}
            filters={controller.filters}
            applyFilters={controller.applyFilters}
            queryKey={controller.queryKey}
            selectedRowKey={controller.selectedRowKey}
            selectRow={controller.selectRow}
            search={searchControl}
            intent={intent}
          />
        ) : (
          <>
            {intent?.source && <LivingContextBar source={intent.source} />}
            {searchControl}
            <DynaTable {...controller.collection} />
          </>
        )}

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
