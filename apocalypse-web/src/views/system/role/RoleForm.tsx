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
      feedback={
        props.mode === 'edit' && !props.initialRow?.dataScope ? (
          <p className="text-sm text-muted-foreground">{t('dataScope.unchanged')}</p>
        ) : undefined
      }
    />
  )
}
