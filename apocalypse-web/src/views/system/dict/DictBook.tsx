/**
 * 字典卡片册（桌面）：每个字典类型一张卡片，原地展开为整行，邻卡以布局弹簧让位。
 * 逃逸 DynaLayer 原因：类型与值的同屏关系浏览和原地展开超出标准列表；数据与写操作仍复用
 * 既有字典接口与 dict-data schema 的 DynaForm，列表视图保留原双页签 DynaPage。
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LayoutGroup, motion } from 'motion/react'
import { ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
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
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { stateMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { ApiError } from '@/lib/api/client'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

import dataSchema from './dict-data.schema'
import {
  DICT_BOOK_PAGE_SIZE,
  createDictValue,
  deleteDictValue,
  enabledDictValues,
  pageDictTypes,
  pageDictValues,
  updateDictValue,
  type DictTypeRow,
  type DictValueRow,
} from './dict-book.api'
import './dict-book.css'

const CHIP_LIMIT = 4

function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const node = ref.current
    if (!node || visible) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])
  return { ref, visible }
}

export function DictBook() {
  const { t } = useTranslation('system')
  const motionEnabled = useMotionPreference()
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const types = useQuery({
    queryKey: ['system', 'dict', 'book', 'types', keyword],
    queryFn: ({ signal }) => pageDictTypes(keyword, signal),
  })
  useResourceDenial({
    errors: [types.error],
    clear: { queryKey: ['system', 'dict', 'book'] },
    reset: () => setExpanded(null),
  })
  const list = isResourceDenied(types.error) ? undefined : types.data?.list
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          setExpanded(null)
          setKeyword(draft.trim())
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('dictBook.search')}
          aria-label={t('dictBook.search')}
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary" size="sm">
          <Search aria-hidden="true" />
          {t('dictBook.query')}
        </Button>
        {types.data && types.data.total > DICT_BOOK_PAGE_SIZE && (
          <p className="text-xs text-muted-foreground">
            {t('dictBook.truncatedTypes', { shown: DICT_BOOK_PAGE_SIZE, total: types.data.total })}
          </p>
        )}
      </form>
      {types.isPending && (
        <div className="dict-book-grid">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      )}
      {types.isError && (
        <div role="alert" className="flex items-center gap-3 rounded-control bg-muted p-3 text-sm">
          <span className="flex-1">
            {types.error instanceof ApiError ? types.error.message : t('dictBook.failed')}
          </span>
          <Button size="sm" variant="outline" onClick={() => void types.refetch()}>
            {t('dictBook.retry')}
          </Button>
        </div>
      )}
      {list && list.length === 0 && (
        <p role="status" className="py-10 text-center text-sm text-muted-foreground">
          {keyword ? t('dictBook.noMatch') : t('dictBook.empty')}
        </p>
      )}
      {list && list.length > 0 && (
        <LayoutGroup>
          <div className="dict-book-grid">
            {list.map((type) => (
              <DictCard
                key={type.id}
                type={type}
                expanded={expanded === type.id}
                motionEnabled={motionEnabled}
                onToggle={() => setExpanded((current) => (current === type.id ? null : type.id))}
              />
            ))}
          </div>
        </LayoutGroup>
      )}
    </div>
  )
}

function DictCard({
  type,
  expanded,
  motionEnabled,
  onToggle,
}: {
  type: DictTypeRow
  expanded: boolean
  motionEnabled: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('system')
  const bodyId = useId()
  const header = useRef<HTMLButtonElement>(null)
  const { ref, visible } = useInView<HTMLDivElement>()
  const [busy, setBusy] = useState(false)
  const preview = useQuery({
    queryKey: ['system', 'dict', 'book', 'preview', type.dictType],
    queryFn: ({ signal }) => enabledDictValues(type.dictType, signal),
    enabled: visible && !expanded,
  })
  const collapse = () => {
    if (busy) return
    onToggle()
    header.current?.focus()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (expanded && event.key === 'Escape' && !busy) {
      event.stopPropagation()
      collapse()
    }
  }
  return (
    <motion.div
      ref={ref}
      layout={motionEnabled ? 'position' : false}
      transition={stateMotion.yieldLayout}
      className={cn('dict-card', expanded && 'dict-card-expanded')}
      data-expanded={expanded || undefined}
      onKeyDown={onKeyDown}
    >
      <button
        ref={header}
        type="button"
        className="dict-card-header"
        aria-expanded={expanded}
        aria-controls={bodyId}
        disabled={busy}
        onClick={expanded ? collapse : onToggle}
      >
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate font-medium">{type.dictName}</span>
          <code className="block truncate font-mono text-xs text-muted-foreground">
            {type.dictType}
          </code>
        </span>
        {type.status !== 1 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {t('dictBook.typeDisabled')}
          </span>
        )}
        <ChevronDown
          data-slot="motion-disclosure-indicator"
          className={cn('size-4 text-muted-foreground', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {!expanded && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('dictBook.enabledValues')}>
          {preview.data?.slice(0, CHIP_LIMIT).map((value) => (
            <span key={value.id} className="dict-chip">
              {value.dictLabel}
              <code className="font-mono text-muted-foreground">{value.dictValue}</code>
            </span>
          ))}
          {preview.data && preview.data.length > CHIP_LIMIT && (
            <span className="text-xs text-muted-foreground">
              {t('dictBook.moreValues', { count: preview.data.length - CHIP_LIMIT })}
            </span>
          )}
          {preview.data?.length === 0 && (
            <span className="text-xs text-muted-foreground">{t('dictBook.noEnabledValues')}</span>
          )}
          {type.remark && (
            <p className="w-full truncate text-xs text-muted-foreground">{type.remark}</p>
          )}
        </div>
      )}
      {expanded && (
        <div id={bodyId} className="mt-4">
          <DictValues type={type} onBusyChange={setBusy} />
        </div>
      )}
    </motion.div>
  )
}

function DictValues({
  type,
  onBusyChange,
}: {
  type: DictTypeRow
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const canEdit = useAuthStore((state) => state.perms.includes('system:dict:edit'))
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; row: DictValueRow | null } | null>(
    null,
  )
  const [deleting, setDeleting] = useState<DictValueRow | null>(null)
  const values = useQuery({
    queryKey: ['system', 'dict', 'book', 'values', type.dictType],
    queryFn: ({ signal }) => pageDictValues(type.dictType, signal),
  })
  useResourceDenial({
    errors: [values.error],
    clear: { queryKey: ['system', 'dict', 'book', 'values', type.dictType] },
    reset: () => {
      setForm(null)
      setDeleting(null)
    },
  })
  const busy = form !== null || deleting !== null
  useEffect(() => onBusyChange(busy), [busy, onBusyChange])
  const refresh = () => client.invalidateQueries({ queryKey: ['system', 'dict'] })
  const localKey = JSON.stringify([type.id, form?.mode, form?.row?.id, deleting?.id])
  const save = useModuleMutation(undefined, {
    localKey,
    mutationFn: (run, body: Record<string, unknown>) =>
      run({
        scope: undefined,
        requiredPerms: [form?.mode === 'edit' ? 'system:dict:edit' : 'system:dict:add'],
        execute: async (transport) => {
          const payload = { ...body, dictType: type.dictType }
          if (form?.mode === 'edit' && form.row)
            await updateDictValue(form.row.id, payload, transport)
          else await createDictValue(payload, transport)
        },
      }),
    onSuccess: () => {
      toast.success(t('dictBook.saved'))
      setForm(null)
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })
  const toggle = useModuleMutation(undefined, {
    localKey: JSON.stringify([type.id, 'toggle']),
    mutationFn: (run, row: DictValueRow) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dict:edit'],
        execute: (transport) =>
          updateDictValue(
            row.id,
            {
              dictType: row.dictType,
              dictLabel: row.dictLabel,
              dictValue: row.dictValue,
              sort: row.sort,
              remark: row.remark,
              status: row.status === 1 ? 0 : 1,
            },
            transport,
          ),
      }),
    onSuccess: () => void refresh(),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })
  const remove = useModuleMutation(undefined, {
    localKey,
    mutationFn: (run, row: DictValueRow) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dict:remove'],
        execute: (transport) => deleteDictValue(row.id, transport),
      }),
    onSuccess: () => {
      toast.success(t('dictBook.deleted'))
      setDeleting(null)
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.deleteFailed')),
  })
  const formConfig = {
    ...dataSchema.form!,
    fields: dataSchema.form!.fields.map((field) =>
      field.name === 'dictType' ? { ...field, disabledInEdit: true, hideInCreate: true } : field,
    ),
  }
  if (values.isPending) return <Skeleton className="h-24" />
  if (values.isError)
    return (
      <div role="alert" className="flex items-center gap-3 rounded-control bg-muted p-3 text-sm">
        <span className="flex-1">
          {values.error instanceof ApiError ? values.error.message : t('dictBook.failed')}
        </span>
        <Button size="sm" variant="outline" onClick={() => void values.refetch()}>
          {t('dictBook.retry')}
        </Button>
      </div>
    )
  const rows = values.data.list
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t('dictBook.valueCount', { count: values.data.total })}
          {values.data.total > rows.length &&
            ` · ${t('dictBook.truncatedValues', { shown: rows.length })}`}
        </p>
        <Perm perm="system:dict:add">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setForm({ mode: 'create', row: null })}
          >
            <Plus aria-hidden="true" />
            {t('dictBook.addValue')}
          </Button>
        </Perm>
      </div>
      {rows.length === 0 ? (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          {t('dictBook.noValues')}
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-control border border-border-subtle">
          {rows.map((row) => (
            <li key={row.id} className="dict-value-row">
              <span className="min-w-0 font-medium break-words">{row.dictLabel}</span>
              <code className="min-w-0 font-mono text-xs break-all text-muted-foreground">
                {row.dictValue}
              </code>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t('dictBook.sort', { sort: row.sort ?? 0 })}
              </span>
              <span
                className="min-w-0 truncate text-xs text-muted-foreground"
                title={row.remark ?? ''}
              >
                {row.remark ?? ''}
              </span>
              <span className="flex items-center justify-end gap-1">
                <Switch
                  checked={row.status === 1}
                  disabled={!canEdit || toggle.isPending}
                  aria-label={t('dictBook.toggle', { label: row.dictLabel })}
                  onCheckedChange={() => toggle.mutate(row)}
                />
                <Perm perm="system:dict:edit">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('dictBook.edit', { label: row.dictLabel })}
                    onClick={() => setForm({ mode: 'edit', row })}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                </Perm>
                <Perm perm="system:dict:remove">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('dictBook.delete', { label: row.dictLabel })}
                    onClick={() => setDeleting(row)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </Perm>
              </span>
            </li>
          ))}
        </ul>
      )}
      {form && (
        <DynaForm
          config={formConfig}
          mode={form.mode}
          open
          initialRow={form.row as Record<string, unknown> | null}
          submitting={save.isPending}
          onOpenChange={(open) => !open && !save.isPending && setForm(null)}
          onSubmit={(body) => save.mutate(body)}
        />
      )}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !remove.isPending && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dictBook.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dictBook.deleteHint', { label: deleting?.dictLabel ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t('dictBook.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (deleting) remove.mutate(deleting)
              }}
            >
              {t('dictBook.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
