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
  const hasAllEditScope = useAuthStore((state) => state.allScopePerms.includes('system:user:edit'))
  const departments = useQuery({
    ...departmentOptionsQuery(props.mode, sessionEpoch),
    enabled: props.open,
  })
  const options = useMemo(
    () => flattenDepartmentOptions(departments.isError ? [] : (departments.data ?? [])),
    [departments.data, departments.isError],
  )
  const originalDept =
    props.initialRow?.deptId != null && props.initialRow.deptId !== ''
      ? String(props.initialRow.deptId)
      : ''
  const originalNickname =
    typeof props.initialRow?.nickname === 'string' ? props.initialRow.nickname : ''
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
          type: 'tree-select' as const,
          required: props.mode === 'edit' && Boolean(originalDept) && !hasAllEditScope,
          translateOptions: false,
          options: deptOptions,
          help: t(
            props.mode === 'create' ? 'user.createDepartmentHelp' : 'user.editDepartmentHelp',
          ),
        },
      ],
    }
  }, [hasAllEditScope, options, originalDept, props.config, props.initialRow, props.mode, t])
  const unavailable = !departments.isSuccess || departments.isFetching
  return (
    <DynaForm
      {...props}
      config={config}
      submitDisabled={unavailable}
      onSubmit={(rawBody) => {
        if (unavailable) return
        const body = { ...rawBody }
        if (typeof body.nickname === 'string') {
          const trimmed = body.nickname.trim()
          if (trimmed === '') delete body.nickname
          else body.nickname = trimmed
        }
        if (props.mode === 'edit') {
          if (originalNickname.trim() !== '' && !('nickname' in body)) {
            body.nickname = null
          }
          // Unchanged original department is omitted to preserve it (including inaccessible departments).
          if (body.deptId === originalDept) {
            delete body.deptId
          } else if (Boolean(originalDept) && !('deptId' in body) && hasAllEditScope) {
            body.deptId = null
          }
        }
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
