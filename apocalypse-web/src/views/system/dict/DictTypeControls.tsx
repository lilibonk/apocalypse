/** Type operations reuse the same schema and endpoints as the compatible Dyna page. */
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { DynaForm } from '@/components/dyna/DynaForm'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api/client'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { useResourceDenial } from '@/lib/query/use-resource-denial'

import { createDictType, deleteDictType, updateDictType, type DictTypeRow } from './dict-book.api'
import { isDictionaryQuery, type DictTypeChange } from './dict-book.model'
import typeSchema from './dict-type.schema'

const permissions = {
  create: typeSchema.createPerm!,
  edit: typeSchema.rowActions!.find((action) => action.kind === 'edit')!.perm!,
  remove: typeSchema.rowActions!.find((action) => action.kind === 'delete')!.perm!,
}

export function DictTypeControls({
  type,
  disabled = false,
  createOpen,
  onCreateOpenChange,
  onBusyChange,
  onChanged,
}: {
  type?: DictTypeRow
  disabled?: boolean
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
  onBusyChange: (busy: boolean) => void
  onChanged: (change: DictTypeChange) => void
}) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const [localOpen, setLocalOpen] = useState(false)
  const [initialRow, setInitialRow] = useState<DictTypeRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const open = type ? localOpen : (createOpen ?? localOpen)
  const setOpen = type ? setLocalOpen : (onCreateOpenChange ?? setLocalOpen)
  const refresh = () =>
    client.invalidateQueries({ predicate: (query) => isDictionaryQuery(query.queryKey) })
  const denial = useResourceDenial({
    errors: [],
    clear: { queryKey: ['system', 'dict', 'book'] },
    refresh: { queryKey: ['system', 'dict', 'book', 'types'] },
    reset: () => {
      setOpen(false)
      setDeleting(false)
      setInitialRow(null)
    },
  })
  const localKey = JSON.stringify([type?.id, type?.dictType, open, deleting])
  const save = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run, body: Record<string, unknown>) =>
      run({
        scope: undefined,
        requiredPerms: [type ? permissions.edit : permissions.create],
        execute: async (transport) => {
          if (!type) return createDictType(body, transport)
          await updateDictType(type.id, body, transport)
          return type.id
        },
      }),
    onSuccess: (id, body) => {
      toast.success(t('dictBook.typeSaved'))
      setOpen(false)
      onChanged({
        id,
        dictType: String(body.dictType),
        name: String(body.dictName),
        action: type ? 'updated' : 'created',
        row: {
          id,
          dictType: String(body.dictType),
          dictName: String(body.dictName),
          status: typeof body.status === 'number' ? body.status : (type?.status ?? 1),
          remark: typeof body.remark === 'string' ? body.remark : null,
        },
      })
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })
  const toggle = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run, row: DictTypeRow) =>
      run({
        scope: undefined,
        requiredPerms: [permissions.edit],
        execute: (transport) =>
          updateDictType(row.id, { ...row, status: row.status === 1 ? 0 : 1 }, transport),
      }),
    onSuccess: (_data, row) => {
      onChanged({
        id: row.id,
        dictType: row.dictType,
        name: row.dictName,
        action: row.status === 1 ? 'disabled' : 'enabled',
        row: { ...row, status: row.status === 1 ? 0 : 1 },
      })
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })
  const remove = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run, row: DictTypeRow) =>
      run({
        scope: undefined,
        requiredPerms: [permissions.remove],
        execute: (transport) => deleteDictType(row.id, transport),
      }),
    onSuccess: (_data, row) => {
      toast.success(t('dictBook.typeDeleted'))
      setDeleting(false)
      onChanged({ id: row.id, dictType: row.dictType, name: row.dictName, action: 'deleted' })
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.deleteFailed')),
  })
  const pending = save.isPending || toggle.isPending || remove.isPending
  const busy = open || deleting || pending
  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])

  return (
    <>
      {type ? (
        <div className="dict-type-actions flex shrink-0 items-center gap-0.5">
          {[
            {
              key: 'edit',
              perm: permissions.edit,
              label: t('dictBook.editType', { name: type.dictName }),
              icon: Pencil,
              action: () => {
                setInitialRow(type)
                setOpen(true)
              },
            },
            {
              key: 'toggle',
              perm: permissions.edit,
              label: t(type.status === 1 ? 'dictBook.disableType' : 'dictBook.enableType', {
                name: type.dictName,
              }),
              icon: Power,
              action: () => toggle.mutate(type),
            },
            {
              key: 'delete',
              perm: permissions.remove,
              label: t('dictBook.deleteType', { name: type.dictName }),
              icon: Trash2,
              action: () => setDeleting(true),
            },
          ].map((action) => (
            <Perm key={action.key} perm={action.perm}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={action.label}
                    disabled={disabled || pending || open || deleting}
                    onClick={action.action}
                    className={action.key === 'delete' ? 'text-destructive' : undefined}
                  >
                    <action.icon aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{action.label}</TooltipContent>
              </Tooltip>
            </Perm>
          ))}
        </div>
      ) : createOpen === undefined ? (
        <Perm perm={permissions.create}>
          <Button disabled={disabled || pending} onClick={() => setOpen(true)}>
            <Plus aria-hidden="true" />
            {t('dictBook.addType')}
          </Button>
        </Perm>
      ) : null}
      {open && (
        <DynaForm
          config={typeSchema.form!}
          mode={type ? 'edit' : 'create'}
          open
          initialRow={initialRow as Record<string, unknown> | null}
          submitting={save.isPending}
          feedback={
            type ? (
              <p className="text-sm text-muted-foreground">{t('dictBook.renameTypeHint')}</p>
            ) : undefined
          }
          onOpenChange={(next) => !save.isPending && setOpen(next)}
          onSubmit={(body) => save.mutate(body)}
        />
      )}
      <AlertDialog open={deleting} onOpenChange={(next) => !remove.isPending && setDeleting(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dictBook.deleteTypeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dictBook.deleteTypeHint', { name: type?.dictName ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t('dictBook.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (type) remove.mutate(type)
              }}
            >
              {t('dictBook.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
