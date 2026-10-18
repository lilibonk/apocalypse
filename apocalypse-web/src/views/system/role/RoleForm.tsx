import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DynaForm, type DynaFormProps } from '@/components/dyna/DynaForm'
import type { DynaPageSchema } from '@/components/dyna/schema'

export function roleFormConfig(config: DynaFormProps['config'], mode: DynaFormProps['mode']) {
  return {
    ...config,
    fields: config.fields.map((field) =>
      field.name === 'dataScope' && mode === 'edit' ? { ...field, defaultValue: undefined } : field,
    ),
  }
}

export function localizeRoleSchema(schema: DynaPageSchema, text: (key: string) => string) {
  const options = ['ALL', 'DEPT', 'DEPT_AND_CHILDREN'].map((value) => ({
    value,
    label: text(`dataScope.${value}`),
  }))
  return {
    ...schema,
    rowActions: schema.rowActions?.map((action) =>
      action.kind === 'custom'
        ? {
            ...action,
            label: text(
              `authorization.${action.key === 'grant-permissions' ? 'permissions' : action.key === 'grant-navigation' ? 'navigation' : action.key === 'grant-users' ? 'members' : 'toggleRole'}`,
            ),
          }
        : action,
    ),
    columns: schema.columns.map((column) =>
      column.key === 'dataScope' ? { ...column, title: text('dataScope.label'), options } : column,
    ),
    form: schema.form && {
      ...schema.form,
      fields: schema.form.fields.map((field) =>
        field.name === 'dataScope'
          ? { ...field, label: text('dataScope.label'), help: text('dataScope.help'), options }
          : field,
      ),
    },
  }
}

export function RoleForm(props: DynaFormProps) {
  const { t } = useTranslation('system')
  const config = useMemo(() => roleFormConfig(props.config, props.mode), [props.config, props.mode])
  return (
    <DynaForm
      {...props}
      config={config}
      submitDisabled={
        props.submitDisabled ||
        (props.mode === 'edit' && typeof props.initialRow?.authorizationRevision !== 'string')
      }
      onSubmit={(body) =>
        props.onSubmit(
          props.mode === 'edit'
            ? {
                ...body,
                expectedAuthorizationRevision: props.initialRow?.authorizationRevision,
              }
            : body,
        )
      }
      feedback={
        props.mode === 'edit' && typeof props.initialRow?.authorizationRevision !== 'string' ? (
          <p role="alert" className="text-sm text-destructive">
            {t('authorization.roleRevisionMissing')}
          </p>
        ) : props.mode === 'edit' && !props.initialRow?.dataScope ? (
          <p className="text-sm text-muted-foreground">{t('dataScope.unchanged')}</p>
        ) : undefined
      }
    />
  )
}
