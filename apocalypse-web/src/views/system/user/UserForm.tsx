/** Operation-specific department options are the only escape from the standard schema form. */
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DynaForm, type DynaFormProps } from '@/components/dyna/DynaForm'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'

import { departmentOptionsQuery, flattenDepartmentOptions } from './department-options'

export function UserForm(props: DynaFormProps) {
  const { t } = useTranslation('system')
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const departments = useQuery({
    ...departmentOptionsQuery(props.mode, sessionEpoch),
    enabled: props.open,
  })
  const options = useMemo(
    () => flattenDepartmentOptions(departments.isError ? [] : (departments.data ?? [])),
    [departments.data, departments.isError],
  )
  const originalDept = typeof props.initialRow?.deptId === 'string' ? props.initialRow.deptId : ''
  const config = useMemo(() => {
    const deptOptions = [...options]
    if (
      props.mode === 'edit' &&
      originalDept &&
      !options.some((entry) => entry.value === originalDept)
    )
      deptOptions.unshift({
        value: originalDept,
        label: t('user.currentUnavailable', {
          name: String(props.initialRow?.deptName ?? originalDept),
        }),
      })
    return {
      ...props.config,
      fields: [
        ...props.config.fields.map((field) =>
          field.name === 'password' ? { ...field, help: t('user.passwordHelp') } : field,
        ),
        {
          name: 'deptId',
          label: t('user.department'),
          type: 'select' as const,
          translateOptions: false,
          options: deptOptions,
          help: t(
            props.mode === 'create' ? 'user.createDepartmentHelp' : 'user.editDepartmentHelp',
          ),
        },
      ],
    }
  }, [options, originalDept, props.config, props.initialRow, props.mode, t])
  const unavailable = !departments.isSuccess || departments.isFetching
  return (
    <DynaForm
      {...props}
      config={config}
      submitDisabled={unavailable}
      onSubmit={(body) => {
        if (unavailable) return
        // Unchanged inaccessible/disabled original department uses the existing null/omitted contract.
        if (props.mode === 'edit' && body.deptId === originalDept) delete body.deptId
        props.onSubmit(body)
      }}
      feedback={
        departments.isError ? (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>
              {departments.error instanceof ApiError
                ? departments.error.message
                : t('user.optionsFailed')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void departments.refetch()}
            >
              {t('user.retryOptions')}
            </Button>
          </div>
        ) : departments.isPending || departments.isFetching ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('user.optionsLoading')}
          </p>
        ) : options.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('user.optionsEmpty')}
          </p>
        ) : undefined
      }
    />
  )
}
