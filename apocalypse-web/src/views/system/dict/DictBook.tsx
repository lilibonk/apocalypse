/**
 * 字典卡片册（桌面）：每个字典类型一张卡片，原地展开为整行，邻卡以布局弹簧让位。
 * 逃逸 DynaLayer 原因：类型与值的同屏关系浏览和原地展开超出标准列表；数据与写操作仍复用
 * 既有字典接口与 dict-data schema 的 DynaForm，列表视图保留原双页签 DynaPage。
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { LayoutGroup, motion } from 'motion/react'
import { ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { DynaForm } from '@/components/dyna/DynaForm'
import { DynaQueryFeedback } from '@/components/dyna/DynaQueryFeedback'
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
import { insightMotion, motionTransition, stateMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { ApiError } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

import dataSchema from './dict-data.schema'
import {
  DICT_BOOK_PAGE_SIZE,
  DICT_VALUE_PAGE_SIZE,
  createDictValue,
  deleteDictValue,
  enabledDictValues,
  pageDictTypes,
  pageDictValues,
  updateDictValue,
  type DictTypeRow,
  type DictValueRow,
} from './dict-book.api'
import { isDictionaryQuery, lastDictionaryPage, type DictTypeChange } from './dict-book.model'
import { DictPagination } from './DictPagination'
import { DictTypeControls } from './DictTypeControls'
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

export function DictBook({
  active = true,
  createOpen,
  onCreateOpenChange,
  onBusyChange,
}: {
  active?: boolean
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const motionEnabled = useMotionPreference()
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busyTypes, setBusyTypes] = useState<ReadonlySet<string>>(new Set())
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [lastChange, setLastChange] = useState<(DictTypeChange & { sequence: number }) | null>(null)
  const result = useRef<HTMLDivElement>(null)
  const busy = creatingBusy || busyTypes.size > 0
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])
  useEffect(() => {
    if (lastChange?.action === 'deleted') result.current?.focus({ preventScroll: true })
  }, [lastChange])
  const onCardBusyChange = useCallback((id: string, value: boolean) => {
    setBusyTypes((previous) => {
      if (previous.has(id) === value) return previous
      const next = new Set(previous)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const onTypeChanged = useCallback(
    (change: DictTypeChange) => {
      setLastChange((previous) => ({ ...change, sequence: (previous?.sequence ?? 0) + 1 }))
      client.setQueriesData<PageResult<DictTypeRow>>(
        { queryKey: ['system', 'dict', 'book', 'types'] },
        (previous) => {
          if (!previous?.list.some((row) => row.id === change.id)) return previous
          return {
            ...previous,
            total: change.action === 'deleted' ? Math.max(0, previous.total - 1) : previous.total,
            list:
              change.action === 'deleted'
                ? previous.list.filter((row) => row.id !== change.id)
                : previous.list.map((row) => (row.id === change.id ? (change.row ?? row) : row)),
          }
        },
      )
      if (change.action === 'deleted')
        setExpanded((current) => (current === change.id ? null : current))
    },
    [client],
  )
  const types = useQuery({
    queryKey: ['system', 'dict', 'book', 'types', keyword, page],
    queryFn: ({ signal }) => pageDictTypes(keyword, page, signal),
    placeholderData: keepPreviousData,
    enabled: active,
  })
  useResourceDenial({
    errors: [types.error],
    clear: { queryKey: ['system', 'dict', 'book'] },
    reset: () => {
      setExpanded(null)
      setLastChange(null)
      onCreateOpenChange?.(false)
    },
  })
  const list = isResourceDenied(types.error) ? undefined : types.data?.list
  const pages = lastDictionaryPage(types.data?.total ?? 0, DICT_BOOK_PAGE_SIZE)
  if (types.data && !types.isPlaceholderData && page > pages) setPage(pages)
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          setExpanded(null)
          setKeyword(draft.trim())
          setPage(1)
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('dictBook.search')}
          aria-label={t('dictBook.search')}
          className="max-w-xs"
          disabled={busy}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
          <Search aria-hidden="true" />
          {t('dictBook.query')}
        </Button>
      </form>
      <DictTypeControls
        disabled={busyTypes.size > 0}
        createOpen={createOpen}
        onCreateOpenChange={onCreateOpenChange}
        onBusyChange={setCreatingBusy}
        onChanged={onTypeChanged}
      />
      {lastChange && (
        <div
          ref={result}
          role="status"
          tabIndex={-1}
          className="dict-book-result flex flex-wrap items-center gap-3 rounded-control bg-muted px-3 py-2 text-sm"
        >
          <span className="flex-1">
            {t(`dictBook.result.${lastChange.action}`, { name: lastChange.name })}
          </span>
          {lastChange.action !== 'deleted' && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setKeyword(lastChange.dictType)
                setDraft(lastChange.dictType)
                setPage(1)
                setExpanded(lastChange.id)
              }}
            >
              {t('dictBook.locateType')}
            </Button>
          )}
        </div>
      )}
      <DynaQueryFeedback
        error={types.error}
        hasData={list !== undefined}
        refreshing={types.isFetching}
        onRetry={() => void types.refetch()}
      />
      {types.isPending && (
        <div className="dict-book-grid">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      )}
      {!types.isError && list && list.length === 0 && (
        <p role="status" className="py-10 text-center text-sm text-muted-foreground">
          {keyword ? t('dictBook.noMatch') : t('dictBook.empty')}
        </p>
      )}
      {list && list.length > 0 && (
        <LayoutGroup>
          <div
            className="dict-book-grid"
            data-dict-motion={motionEnabled ? 'on' : 'off'}
            aria-busy={types.isFetching}
          >
            {list.map((type) => (
              <DictCard
                key={type.id}
                type={type}
                expanded={expanded === type.id}
                motionEnabled={motionEnabled}
                active={active}
                disabled={busy || types.isPlaceholderData}
                changed={lastChange?.id === type.id ? lastChange : undefined}
                onBusyChange={onCardBusyChange}
                onTypeChanged={onTypeChanged}
                onToggle={() => {
                  if (!busy) setExpanded((current) => (current === type.id ? null : type.id))
                }}
              />
            ))}
          </div>
        </LayoutGroup>
      )}
      {list && types.data && (
        <DictPagination
          page={page}
          total={types.data.total}
          size={DICT_BOOK_PAGE_SIZE}
          label={t('dictBook.typePages')}
          disabled={busy || types.isFetching}
          onChange={(next) => {
            setExpanded(null)
            setPage(next)
          }}
        />
      )}
    </div>
  )
}

function DictCard({
  type,
  expanded,
  motionEnabled,
  active,
  disabled,
  changed,
  onBusyChange,
  onTypeChanged,
  onToggle,
}: {
  type: DictTypeRow
  expanded: boolean
  motionEnabled: boolean
  active: boolean
  disabled: boolean
  changed?: DictTypeChange & { sequence: number }
  onBusyChange: (id: string, busy: boolean) => void
  onTypeChanged: (change: DictTypeChange) => void
  onToggle: () => void
}) {
  const { t } = useTranslation('system')
  const bodyId = useId()
  const header = useRef<HTMLButtonElement>(null)
  const { ref, visible } = useInView<HTMLDivElement>()
  const [valueBusy, setValueBusy] = useState(false)
  const [typeBusy, setTypeBusy] = useState(false)
  const busy = valueBusy || typeBusy
  useEffect(() => {
    onBusyChange(type.id, busy)
    return () => onBusyChange(type.id, false)
  }, [busy, onBusyChange, type.id])
  const preview = useQuery({
    queryKey: ['system', 'dict', 'book', 'preview', type.dictType],
    queryFn: ({ signal }) => enabledDictValues(type.dictType, signal),
    enabled: active && visible && !expanded,
  })
  const collapse = () => {
    if (busy || disabled) return
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
      layout={motionEnabled}
      transition={stateMotion.yieldLayout}
      className={cn('dict-card', expanded && 'dict-card-expanded')}
      data-expanded={expanded || undefined}
      onKeyDown={onKeyDown}
    >
      <motion.div
        layout={motionEnabled ? 'position' : false}
        transition={stateMotion.yieldLayout}
        className="dict-card-heading flex items-start gap-2"
      >
        <motion.button
          ref={header}
          layout={motionEnabled ? 'position' : false}
          transition={stateMotion.yieldLayout}
          type="button"
          className="dict-card-header"
          aria-expanded={expanded}
          aria-controls={bodyId}
          disabled={busy || disabled}
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
        </motion.button>
        <DictTypeControls
          type={type}
          disabled={disabled || valueBusy}
          onBusyChange={setTypeBusy}
          onChanged={onTypeChanged}
        />
      </motion.div>
      {changed && (
        <motion.p
          key={changed.sequence}
          initial={motionEnabled ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={motionEnabled ? motionTransition.feedback : insightMotion.instant}
          className="mt-2 text-xs text-muted-foreground"
        >
          {t(`dictBook.result.${changed.action}`, { name: type.dictName })}
        </motion.p>
      )}
      {!expanded && (
        <motion.div
          layout={motionEnabled ? 'position' : false}
          transition={stateMotion.yieldLayout}
          className="dict-card-body mt-3 flex flex-wrap gap-1.5"
          aria-label={t('dictBook.enabledValues')}
        >
          {preview.data?.slice(0, CHIP_LIMIT).map((value) => (
            <span key={value.id} className="dict-chip">
              {value.dictLabel}
              <code className="font-mono text-muted-foreground">
                {t('dictBook.storedValue', { value: value.dictValue })}
              </code>
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
        </motion.div>
      )}
      {expanded && (
        <motion.div
          id={bodyId}
          layout={motionEnabled ? 'position' : false}
          transition={stateMotion.yieldLayout}
          className="dict-card-body mt-4"
        >
          <DictValues
            key={type.dictType}
            type={type}
            active={active}
            motionEnabled={motionEnabled}
            onBusyChange={setValueBusy}
          />
        </motion.div>
      )}
    </motion.div>
  )
}

function DictValues({
  type,
  active,
  motionEnabled,
  onBusyChange,
}: {
  type: DictTypeRow
  active: boolean
  motionEnabled: boolean
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const canEdit = useAuthStore((state) => state.perms.includes('system:dict:edit'))
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; row: DictValueRow | null } | null>(
    null,
  )
  const [deleting, setDeleting] = useState<DictValueRow | null>(null)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{
    id: string
    label: string
    action: 'saved' | 'enabled' | 'disabled' | 'deleted'
    sequence: number
  } | null>(null)
  const values = useQuery({
    queryKey: ['system', 'dict', 'book', 'values', type.dictType, page],
    queryFn: ({ signal }) => pageDictValues(type.dictType, page, signal),
    placeholderData: keepPreviousData,
    enabled: active,
  })
  const denial = useResourceDenial({
    errors: [values.error],
    clear: { queryKey: ['system', 'dict', 'book', 'values', type.dictType] },
    reset: () => {
      setForm(null)
      setDeleting(null)
      setResult(null)
    },
  })
  const refresh = () =>
    client.invalidateQueries({ predicate: (query) => isDictionaryQuery(query.queryKey) })
  const updateCachedRow = (id: string, update: (row: DictValueRow) => DictValueRow | null) => {
    client.setQueriesData<PageResult<DictValueRow>>(
      { queryKey: ['system', 'dict', 'book', 'values', type.dictType] },
      (previous) => {
        if (!previous?.list.some((row) => row.id === id)) return previous
        const list = previous.list.flatMap((row) => {
          const next = row.id === id ? update(row) : row
          return next ? [next] : []
        })
        return { ...previous, list, total: previous.total - (previous.list.length - list.length) }
      },
    )
  }
  const showResult = (id: string, label: string, action: NonNullable<typeof result>['action']) =>
    setResult((previous) => ({ id, label, action, sequence: (previous?.sequence ?? 0) + 1 }))
  const localKey = JSON.stringify([type.id, type.dictType, form?.mode, form?.row?.id, deleting?.id])
  const save = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run, body: Record<string, unknown>) =>
      run({
        scope: undefined,
        requiredPerms: [form?.mode === 'edit' ? 'system:dict:edit' : 'system:dict:add'],
        execute: async (transport) => {
          const payload = { ...body, dictType: type.dictType }
          if (form?.mode === 'edit' && form.row) {
            await updateDictValue(form.row.id, payload, transport)
            return form.row.id
          }
          return createDictValue(payload, transport)
        },
      }),
    onSuccess: (id, body) => {
      toast.success(t('dictBook.saved'))
      showResult(id, String(body.dictLabel), 'saved')
      updateCachedRow(id, (row) => ({
        ...row,
        dictLabel: String(body.dictLabel),
        dictValue: String(body.dictValue),
        sort: typeof body.sort === 'number' ? body.sort : 0,
        status: typeof body.status === 'number' ? body.status : row.status,
        remark: typeof body.remark === 'string' ? body.remark : null,
      }))
      setForm(null)
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })
  const toggle = useModuleMutation(undefined, {
    localKey: JSON.stringify([type.id, type.dictType, 'toggle']),
    onDenied: denial,
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
    onSuccess: (_data, row) => {
      updateCachedRow(row.id, (current) => ({ ...current, status: row.status === 1 ? 0 : 1 }))
      showResult(row.id, row.dictLabel, row.status === 1 ? 'disabled' : 'enabled')
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })
  const remove = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run, row: DictValueRow) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dict:remove'],
        execute: (transport) => deleteDictValue(row.id, transport),
      }),
    onSuccess: (_data, row) => {
      toast.success(t('dictBook.deleted'))
      updateCachedRow(row.id, () => null)
      showResult(row.id, row.dictLabel, 'deleted')
      setDeleting(null)
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.deleteFailed')),
  })
  const pending = save.isPending || toggle.isPending || remove.isPending
  const busy = form !== null || deleting !== null || pending
  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])
  const pages = lastDictionaryPage(values.data?.total ?? 0, DICT_VALUE_PAGE_SIZE)
  if (values.data && !values.isPlaceholderData && page > pages) setPage(pages)
  const formConfig = {
    ...dataSchema.form!,
    fields: dataSchema.form!.fields.map((field) =>
      field.name === 'dictType' ? { ...field, disabledInEdit: true, hideInCreate: true } : field,
    ),
  }
  if (values.isPending) return <Skeleton className="h-24" />
  if ((values.isError && !values.data) || isResourceDenied(values.error))
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
  const rows = values.data?.list ?? []
  return (
    <div className="space-y-3">
      <DynaQueryFeedback
        error={values.error}
        hasData={values.data !== undefined}
        refreshing={values.isFetching}
        onRetry={() => void values.refetch()}
      />
      {result && (
        <motion.p
          key={result.sequence}
          role="status"
          initial={motionEnabled ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={motionEnabled ? motionTransition.feedback : insightMotion.instant}
          className="text-sm text-muted-foreground"
        >
          {t(`dictBook.valueResult.${result.action}`, { label: result.label })}
        </motion.p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t('dictBook.valueCount', { count: values.data?.total ?? 0 })}
        </p>
        <Perm perm="system:dict:add">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || values.isPlaceholderData}
            onClick={() => setForm({ mode: 'create', row: null })}
          >
            <Plus aria-hidden="true" />
            {t('dictBook.addValue')}
          </Button>
        </Perm>
      </div>
      {rows.length === 0 && !values.isError ? (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          {t('dictBook.noValues')}
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-control border border-border-subtle">
          {rows.map((row) => (
            <motion.li
              key={row.id}
              layout={motionEnabled ? 'position' : false}
              transition={stateMotion.yieldLayout}
              className="dict-value-row"
              data-value-result={result?.id === row.id || undefined}
            >
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
                  disabled={!canEdit || busy || values.isPlaceholderData}
                  aria-label={t('dictBook.toggle', { label: row.dictLabel })}
                  onCheckedChange={() => toggle.mutate(row)}
                />
                <Perm perm="system:dict:edit">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('dictBook.edit', { label: row.dictLabel })}
                    disabled={busy || values.isPlaceholderData}
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
                    disabled={busy || values.isPlaceholderData}
                    onClick={() => setDeleting(row)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </Perm>
              </span>
            </motion.li>
          ))}
        </ul>
      )}
      {values.data && (
        <DictPagination
          page={page}
          total={values.data.total}
          size={DICT_VALUE_PAGE_SIZE}
          label={t('dictBook.valuePages', { name: type.dictName })}
          disabled={busy || values.isFetching}
          onChange={setPage}
        />
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
