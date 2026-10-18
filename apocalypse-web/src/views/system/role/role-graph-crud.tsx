import { useMemo, useState } from 'react'
import { useQueryClient, type QueryFilters } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Pencil, Plus, Power, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { FieldOption, FieldSelect } from '@/components/ui/field-select'
import {
  buildFormValidator,
  defaultFormValues,
  formValuesToBody,
  rowToFormValues,
  visibleFields,
  type DynaFormValues,
} from '@/components/dyna/form-model'
import { useDynaText } from '@/components/dyna/use-dyna'
import { ApiError } from '@/lib/api/client'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'

import { localizeRoleSchema, roleFormConfig } from './RoleForm'
import schema from './role.schema'
import type { RolePermissionTarget } from './role-permission.model'
import {
  createRole,
  deleteRole,
  invalidateRoleGraphQueries,
  updateRole,
  type RoleGraphSaveInput,
} from './role-graph.operations'
import { useRoleGraphMutation } from './use-role-graph-mutation'
import {
  hasCompleteRoleGraphRecord,
  roleGraphCommandPerm,
  roleGraphFormBody,
  roleGraphToggleBody,
  type RoleGraphCommand,
} from './role-graph-crud.model'

export function RoleGraphObjectActions({
  role,
  disabled,
  onCommand,
}: {
  role: RolePermissionTarget
  disabled: boolean
  onCommand: (kind: 'edit' | 'toggle' | 'delete') => void
}) {
  const { t } = useTranslation('system')
  const auth = useAuthStore()
  const complete = hasCompleteRoleGraphRecord(role)
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label={t('roleManage.objectActions', { defaultValue: '所选角色操作' })}
    >
      {auth.allScopePerms.includes('system:role:edit') && (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !complete}
            onClick={() => onCommand('edit')}
          >
            <Pencil className="size-3.5" />
            {t('roleManage.edit', { defaultValue: '编辑属性' })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !complete}
            onClick={() => onCommand('toggle')}
          >
            <Power className="size-3.5" />
            {role.status === 1
              ? t('roleManage.disable', { defaultValue: '停用角色' })
              : t('roleManage.enable', { defaultValue: '启用角色' })}
          </Button>
        </>
      )}
      {auth.allScopePerms.includes('system:role:remove') && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={disabled}
          onClick={() => onCommand('delete')}
        >
          <Trash2 className="size-3.5" />
          {t('roleManage.delete', { defaultValue: '删除角色' })}
        </Button>
      )}
    </div>
  )
}

export function RoleGraphCrudPanel({
  command,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
  onDenied,
  clearQueries,
}: {
  command: RoleGraphCommand
  onClose: () => void
  onCreated: (id: string, keyword: string) => void
  onUpdated: (id: string, keyword: string) => void
  onDeleted: (id: string) => void
  onDenied: () => void
  clearQueries: QueryFilters
}) {
  const { t } = useTranslation('system')
  const dynaText = useDynaText()
  const queryClient = useQueryClient()
  const mode = command.kind === 'create' ? 'create' : 'edit'
  const role = command.kind === 'create' ? null : command.role
  const config = useMemo(() => roleFormConfig(localizeRoleSchema(schema, t).form!, mode), [mode, t])
  const fields = useMemo(() => visibleFields(config.fields, mode), [config.fields, mode])
  const [values, setValues] = useState<DynaFormValues>(() =>
    role ? rowToFormValues(fields, { ...role }) : defaultFormValues(fields),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const denial = useResourceDenial({ errors: [], clear: clearQueries, reset: onDenied })
  const validator = useMemo(
    () =>
      buildFormValidator(fields, (key, params) =>
        dynaText(key, {
          ...params,
          ...(typeof params.label === 'string' ? { label: dynaText(params.label) } : {}),
        }),
      ),
    [fields, dynaText],
  )
  const mutation = useRoleGraphMutation<RoleGraphSaveInput | undefined, string | undefined>({
    requiredPerms: ['system:role:list', roleGraphCommandPerm(command)],
    requiredAllScopePerms: [roleGraphCommandPerm(command)],
    localKey: command.id,
    onDenied: denial,
    mutationFn: async (body, transport) => {
      if (command.kind === 'create') return createRole(transport, body!)
      if (command.kind === 'delete') await deleteRole(transport, command.role.id)
      else
        await updateRole(transport, {
          roleId: command.role.id,
          body: command.kind === 'toggle' ? roleGraphToggleBody(command.role) : body!,
        })
      return undefined
    },
    onSuccess: (id, body) => {
      toast.success(
        command.kind === 'delete'
          ? t('roleManage.deleted', { defaultValue: '角色已删除' })
          : t('roleManage.saved', { defaultValue: '角色已保存' }),
      )
      if (command.kind === 'create') onCreated(id!, body!.roleKey)
      else if (command.kind === 'delete') onDeleted(command.role.id)
      else onUpdated(command.role.id, body?.roleKey ?? command.role.roleKey)
      void invalidateRoleGraphQueries(queryClient, role?.id)
    },
    onError: (error) =>
      setFailure(
        error instanceof ApiError
          ? error.message
          : t('roleManage.saveFailed', { defaultValue: '保存失败，请重试' }),
      ),
  })

  const title =
    command.kind === 'create'
      ? t('roleManage.create', { defaultValue: '新增角色' })
      : command.kind === 'edit'
        ? t('roleManage.edit', { defaultValue: '编辑属性' })
        : command.kind === 'delete'
          ? t('roleManage.delete', { defaultValue: '删除角色' })
          : role!.status === 1
            ? t('roleManage.disable', { defaultValue: '停用角色' })
            : t('roleManage.enable', { defaultValue: '启用角色' })
  const isForm = command.kind === 'create' || command.kind === 'edit'
  const previewName =
    isForm && typeof values.roleName === 'string' && values.roleName.trim()
      ? values.roleName.trim()
      : role?.roleName || t('roleManage.draft', { defaultValue: '新角色草稿' })

  return (
    <section className="min-w-0 space-y-4" aria-label={title}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {t('roleManage.objectContext', { defaultValue: '角色节点 · 当前操作' })}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        </div>
        <Button variant="ghost" disabled={mutation.isPending} onClick={onClose}>
          <ArrowLeft className="size-4" />
          {isForm
            ? t('roleManage.discard', { defaultValue: '放弃编辑' })
            : t('roleManage.cancel', { defaultValue: '取消' })}
        </Button>
      </header>
      <div className="grid min-w-0 gap-4 rounded-2xl border border-primary/30 bg-card p-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,5fr)]">
        <div className="flex min-h-56 min-w-0 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
          <span className="relative flex size-28 items-center justify-center rounded-full border-2 border-primary/60 bg-background shadow-sm">
            <ShieldCheck className="size-10 text-primary" strokeWidth={1.5} />
            {command.kind === 'create' && (
              <span className="absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="size-5" />
              </span>
            )}
          </span>
          <h3 className="max-w-full break-words text-lg font-semibold">{previewName}</h3>
          <p className="max-w-full break-all text-xs text-muted-foreground">
            {role?.roleKey || t('roleManage.draftHint', { defaultValue: '填写属性后创建此节点' })}
          </p>
          <span className="rounded-full border border-primary/30 bg-background px-3 py-1 text-xs text-primary">
            {t('roleManage.unsaved', { defaultValue: '待保存' })}
          </span>
          {role && (
            <code className="max-w-full break-all text-xs text-muted-foreground">{role.id}</code>
          )}
          {command.kind !== 'delete' && (
            <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">
              {command.kind === 'create'
                ? t('roleManage.createHint', {
                    defaultValue: '创建后可在此角色上继续连接菜单与权限。',
                  })
                : t('roleManage.editHint', {
                    defaultValue: '保存后返回此对象，继续管理它的授权关系。',
                  })}
            </p>
          )}
        </div>
        <div className="min-w-0">
          {failure && (
            <p
              className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {failure}
            </p>
          )}
          {isForm ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                if (mutation.isPending) return
                const parsed = validator.safeParse(values)
                if (!parsed.success) {
                  setErrors(
                    Object.fromEntries(
                      parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
                    ),
                  )
                  return
                }
                setErrors({})
                setFailure(null)
                mutation.mutate(
                  roleGraphFormBody(
                    formValuesToBody(fields, values, mode),
                    mode,
                    role?.authorizationRevision,
                  ),
                )
              }}
            >
              {fields.map((field) => {
                const id = `role-graph-${command.id}-${field.name}`
                const error = errors[field.name]
                const value =
                  typeof values[field.name] === 'string' ? (values[field.name] as string) : ''
                const change = (next: string | boolean) =>
                  setValues((previous) => ({ ...previous, [field.name]: next }))
                const props = {
                  id,
                  disabled: mutation.isPending,
                  'aria-invalid': !!error,
                  'aria-describedby': error ? `${id}-error` : undefined,
                }
                return (
                  <div className="space-y-2" key={field.name}>
                    <Label htmlFor={id}>
                      {dynaText(field.label)}
                      {field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    {field.type === 'select' ? (
                      <FieldSelect {...props} value={value} onValueChange={change}>
                        <FieldOption value="">{dynaText('queryUnselected')}</FieldOption>
                        {field.options?.map((option) => (
                          <FieldOption key={option.value} value={option.value}>
                            {option.label}
                          </FieldOption>
                        ))}
                      </FieldSelect>
                    ) : field.type === 'switch' ? (
                      <Switch
                        {...props}
                        checked={Boolean(values[field.name])}
                        onCheckedChange={change}
                      />
                    ) : field.type === 'textarea' ? (
                      <Textarea
                        {...props}
                        value={value}
                        maxLength={field.maxLength}
                        onChange={(event) => change(event.target.value)}
                      />
                    ) : (
                      <Input
                        {...props}
                        autoFocus={field.name === 'roleName'}
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={value}
                        min={field.min}
                        max={field.max}
                        maxLength={field.maxLength}
                        onChange={(event) => change(event.target.value)}
                      />
                    )}
                    {field.help && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {dynaText(field.help)}
                      </p>
                    )}
                    {error && (
                      <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
                        {error}
                      </p>
                    )}
                  </div>
                )
              })}
              {mode === 'edit' && !role?.dataScope && (
                <p className="text-xs text-muted-foreground">{t('dataScope.unchanged')}</p>
              )}
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={onClose}
                >
                  {t('roleManage.cancel', { defaultValue: '取消' })}
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  <Save className="size-4" />
                  {mutation.isPending
                    ? t('roleManage.saving', { defaultValue: '保存中…' })
                    : t('roleManage.save', { defaultValue: '保存角色' })}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex h-full min-h-56 flex-col justify-center gap-5">
              <h3 className="text-base font-semibold">
                {title} · {role!.roleName}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {command.kind === 'delete'
                  ? t('roleManage.deleteConfirm', {
                      defaultValue: '删除此角色也会解除它与菜单、用户的关联。此操作保存后生效。',
                    })
                  : role!.status === 1
                    ? t('roleManage.disableConfirm', {
                        defaultValue: '停用后，此角色不再提供权限。现有角色属性及授权关系将保留。',
                      })
                    : t('roleManage.enableConfirm', {
                        defaultValue: '启用后，此角色将按现有配置提供权限。',
                      })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
                  {t('roleManage.cancel', { defaultValue: '取消' })}
                </Button>
                <Button
                  variant={command.kind === 'delete' ? 'destructive' : 'default'}
                  disabled={mutation.isPending}
                  onClick={() => {
                    setFailure(null)
                    mutation.mutate(undefined)
                  }}
                >
                  {mutation.isPending ? t('roleManage.saving', { defaultValue: '保存中…' }) : title}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
