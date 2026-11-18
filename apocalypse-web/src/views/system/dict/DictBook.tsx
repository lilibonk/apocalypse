/**
 * 字典样本册（桌面）：
 * - 固定 3 列样本卡目录：类型编码头 + 启停双色比例细条 + 6 色语义色卡胶囊流 + 状态底栏
 * - 点击任意字典卡或快捷按钮滑出右侧宽抽屉（Sheet）单一滚动维护字典值与类型属性，
 *   避免网格跨列换行引发空洞与主容器双重滚动
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Check, ChevronRight, Pencil, Plus, Power, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { DynaPagination, DynaQueryFeedback } from '@/components/dyna'
import { LivingContextBar, useEntityIntent } from '@/components/navigation'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { insightMotion, motionTransition } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { ApiError } from '@/lib/api/client'
import type { DictTone, PageResult } from '@/lib/api/types'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

import {
  DICT_BOOK_PAGE_SIZE,
  DICT_BOOK_PAGE_SIZE_OPTIONS,
  DICT_VALUE_PAGE_SIZE,
  batchDictValues,
  createDictValue,
  deleteDictType,
  deleteDictValue,
  pageDictTypes,
  pageDictValues,
  updateDictType,
  updateDictValue,
  type DictTypeRow,
  type DictValueRow,
} from './dict-book.api'
import {
  DICT_TONES,
  computeDictRatio,
  isDictionaryQuery,
  lastDictionaryPage,
  resolveDictSwatchTone,
  type DictTypeChange,
} from './dict-book.model'
import { DictTypeControls } from './DictTypeControls'
import './dict-book.css'

const CHIP_LIMIT = 6

const TONE_LABELS: Record<DictTone, string> = {
  BRAND: '品牌主色',
  INFO: '信息青色',
  SUCCESS: '成功绿色',
  WARNING: '警示琥珀',
  DANGER: '危险红色',
  NEUTRAL: '中性灰阶',
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
  const { intent, clearPulse } = useEntityIntent('dict')
  const [draft, setDraft] = useState(() => intent?.id ?? '')
  const [keyword, setKeyword] = useState(() => intent?.id ?? '')
  const [statusFilter, setStatusFilter] = useState<'all' | '1' | '0'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DICT_BOOK_PAGE_SIZE)
  const [selectedType, setSelectedType] = useState<DictTypeRow | null | 'none'>(null)
  const [valueBusy, setValueBusy] = useState(false)
  const [typeBusy, setTypeBusy] = useState(false)
  const [liveTotal, setLiveTotal] = useState<number | null>(null)
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [lastChange, setLastChange] = useState<(DictTypeChange & { sequence: number }) | null>(null)
  const result = useRef<HTMLDivElement>(null)
  const drawerBusy = valueBusy || typeBusy
  const busy = creatingBusy || drawerBusy

  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  useEffect(() => {
    if (lastChange?.action === 'deleted') result.current?.focus({ preventScroll: true })
  }, [lastChange])

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
      if (change.action === 'deleted') {
        setSelectedType((current) =>
          current !== null && current !== 'none' && current.id === change.id ? 'none' : current,
        )
      } else if (change.row) {
        const nextRow = change.row
        setSelectedType((current) =>
          current !== null && current !== 'none' && current.id === change.id ? nextRow : current,
        )
      }
    },
    [client],
  )

  const types = useQuery({
    queryKey: ['system', 'dict', 'book', 'types', keyword, statusFilter, page, pageSize],
    queryFn: ({ signal }) =>
      pageDictTypes(
        keyword,
        page,
        signal,
        statusFilter === 'all' ? undefined : Number(statusFilter),
        pageSize,
      ),
    placeholderData: keepPreviousData,
    enabled: active,
  })

  const list = isResourceDenied(types.error) ? undefined : types.data?.list
  const pageTypeCodes = useMemo(() => (list ?? []).map((item) => item.dictType), [list])

  const batchPreview = useQuery({
    queryKey: ['system', 'dict', 'book', 'batch', pageTypeCodes],
    queryFn: ({ signal }) => batchDictValues(pageTypeCodes, signal),
    placeholderData: keepPreviousData,
    enabled: active && pageTypeCodes.length > 0,
  })

  // Support EntityPill deep-link focus (`?dictType=...` or `?focusId=...`)
  const resolvedSelectedType: DictTypeRow | null =
    selectedType === 'none'
      ? null
      : selectedType !== null
        ? (list?.find((item) => item.id === selectedType.id) ?? selectedType)
        : intent?.id
          ? (list?.find((item) => item.dictType === intent.id || item.id === intent.id) ?? null)
          : null

  useEffect(() => {
    if (intent?.triggerPulse && resolvedSelectedType) {
      clearPulse()
    }
  }, [clearPulse, intent?.triggerPulse, resolvedSelectedType])

  useResourceDenial({
    errors: [types.error, batchPreview.error],
    clear: { queryKey: ['system', 'dict', 'book'] },
    reset: () => {
      setSelectedType(null)
      setValueBusy(false)
      setTypeBusy(false)
      setLiveTotal(null)
      setLastChange(null)
      onCreateOpenChange?.(false)
    },
  })

  const pages = lastDictionaryPage(types.data?.total ?? 0, pageSize)
  if (types.data && !types.isPlaceholderData && page > pages) setPage(pages)

  return (
    <div className="space-y-5">
      <LivingContextBar source={intent?.source} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border-subtle bg-card p-3.5 shadow-surface">
        <form
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            setSelectedType('none')
            setKeyword(draft.trim())
            setPage(1)
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('dictBook.search')}
            aria-label={t('dictBook.search')}
            className="h-9 w-full sm:w-64"
            disabled={busy}
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            <Search aria-hidden="true" />
            {t('dictBook.query')}
          </Button>
          {(keyword || statusFilter !== 'all') && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSelectedType('none')
                setDraft('')
                setKeyword('')
                setStatusFilter('all')
                setPage(1)
              }}
            >
              <X aria-hidden="true" />
              {t('common.重置', { defaultValue: '重置' })}
            </Button>
          )}
        </form>
        <div
          role="group"
          aria-label="字典状态筛选"
          className="inline-flex h-9 items-center gap-1 rounded-control border border-border-subtle bg-muted/40 p-1"
        >
          {(
            [
              { value: 'all', label: '全部' },
              { value: '1', label: '正常' },
              { value: '0', label: '停用' },
            ] as const
          ).map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={statusFilter === option.value ? 'secondary' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              aria-pressed={statusFilter === option.value}
              disabled={busy}
              onClick={() => {
                if (statusFilter === option.value) return
                setSelectedType('none')
                setStatusFilter(option.value)
                setPage(1)
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
      <DictTypeControls
        disabled={drawerBusy}
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
                setSelectedType(
                  lastChange.row ?? {
                    id: lastChange.id,
                    dictType: lastChange.dictType,
                    dictName: lastChange.name,
                    status: 1,
                    remark: null,
                  },
                )
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
          {keyword || statusFilter !== 'all' ? t('dictBook.noMatch') : t('dictBook.empty')}
        </p>
      )}
      {list && list.length > 0 && (
        <div className="dict-book-grid" aria-busy={types.isFetching}>
          {list.map((type) => (
            <DictCard
              key={type.id}
              type={type}
              batchItems={batchPreview.data?.[type.dictType]}
              selected={resolvedSelectedType?.id === type.id}
              motionEnabled={motionEnabled}
              disabled={busy || types.isPlaceholderData}
              changed={lastChange?.id === type.id ? lastChange : undefined}
              onOpen={() => {
                if (!busy) {
                  setLiveTotal(null)
                  setSelectedType(type)
                }
              }}
            />
          ))}
        </div>
      )}
      {list && types.data && (
        <DynaPagination
          ariaLabel={t('dictBook.typePages')}
          page={Math.min(page, pages)}
          size={pageSize}
          total={types.data.total}
          pageSizeOptions={DICT_BOOK_PAGE_SIZE_OPTIONS}
          disabled={busy || types.isFetching}
          onPageChange={(next) => {
            setSelectedType('none')
            setPage(next)
          }}
          onPageSizeChange={(nextSize) => {
            setSelectedType('none')
            setPageSize(nextSize)
            setPage(1)
          }}
        />
      )}

      <Sheet
        open={resolvedSelectedType !== null}
        onOpenChange={(open) => {
          if (!open && !drawerBusy) {
            setSelectedType('none')
            setLiveTotal(null)
          }
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl lg:max-w-4xl"
          showCloseButton={!drawerBusy}
          onEscapeKeyDown={(event) => {
            if (drawerBusy) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (drawerBusy) event.preventDefault()
          }}
        >
          {resolvedSelectedType && (
            <>
              <SheetHeader className="border-b border-border-subtle px-6 py-4 pr-14">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-lg font-semibold">
                    {resolvedSelectedType.dictName}
                  </SheetTitle>
                  <Badge variant={resolvedSelectedType.status === 1 ? 'success' : 'secondary'}>
                    {resolvedSelectedType.status === 1
                      ? t('dictBook.statusEnabled', { defaultValue: '正常' })
                      : t('dictBook.typeDisabled')}
                  </Badge>
                </div>
                <SheetDescription asChild>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-foreground">
                      {resolvedSelectedType.dictType}
                    </code>
                    <span>·</span>
                    <span className="tabular-nums">
                      {t('dictBook.valueCount', {
                        count:
                          liveTotal ??
                          batchPreview.data?.[resolvedSelectedType.dictType]?.length ??
                          0,
                      })}
                    </span>
                  </div>
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
                <DictValues
                  key={resolvedSelectedType.id}
                  type={resolvedSelectedType}
                  initialItems={batchPreview.data?.[resolvedSelectedType.dictType]}
                  active={active}
                  motionEnabled={motionEnabled}
                  onBusyChange={setValueBusy}
                  onTypeBusyChange={setTypeBusy}
                  onTotalChange={setLiveTotal}
                  onTypeChanged={onTypeChanged}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function DictCard({
  type,
  batchItems,
  selected,
  motionEnabled,
  disabled,
  changed,
  onOpen,
}: {
  type: DictTypeRow
  batchItems?: readonly DictValueRow[]
  selected: boolean
  motionEnabled: boolean
  disabled: boolean
  changed?: DictTypeChange & { sequence: number }
  onOpen: () => void
}) {
  const { t } = useTranslation('system')

  const previewItems = batchItems ?? []
  const ratio = useMemo(() => computeDictRatio(batchItems ?? []), [batchItems])

  return (
    <article className="dict-card sketch-surface" data-selected={selected ? 'true' : undefined}>
      <button
        type="button"
        className="dict-card-header cursor-pointer"
        disabled={disabled}
        onClick={onOpen}
      >
        <span className="min-w-0 flex-1 text-left">
          <code className="block truncate font-mono text-sm font-semibold text-foreground">
            {type.dictType}
          </code>
          <span className="block truncate text-xs text-muted-foreground">{type.dictName}</span>
        </span>
        {type.status !== 1 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t('dictBook.typeDisabled')}
          </span>
        )}
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {t('dictBook.itemCountSummary', {
            count: ratio.total,
            defaultValue: `${ratio.total} 项`,
          })}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {/* Enabled / Disabled ratio thin bar (frame 0999.jpg) */}
      <div
        data-slot="dict-ratio-bar"
        className="dict-ratio-bar mt-2.5"
        title={t('dictBook.ratioSummary', {
          enabled: ratio.enabled,
          disabled: ratio.disabled,
          defaultValue: `启用 ${ratio.enabled} / 停用 ${ratio.disabled}`,
        })}
        aria-hidden="true"
      >
        <span
          data-slot="dict-ratio-enabled"
          className="dict-ratio-segment-enabled"
          style={{ width: `${ratio.enabledPercent}%` }}
        />
        <span
          data-slot="dict-ratio-disabled"
          className="dict-ratio-segment-disabled"
          style={{ width: `${ratio.disabledPercent}%` }}
        />
      </div>

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

      <div
        className="dict-card-body mt-3 flex min-h-[3.25rem] flex-wrap content-start gap-1.5"
        aria-label={t('dictBook.enabledValues')}
      >
        {previewItems.slice(0, CHIP_LIMIT).map((value) => {
          const tone = resolveDictSwatchTone(type.dictType, value)
          return (
            <span
              key={value.id}
              data-slot="dict-swatch-chip"
              data-tone={tone}
              data-disabled={value.status !== 1 ? 'true' : undefined}
              className="dict-swatch-chip"
            >
              <span className="dict-swatch-dot-indicator" aria-hidden="true" />
              <span>{value.dictLabel}</span>
              {value.isDefault === 1 && (
                <span
                  className="dict-swatch-default"
                  aria-label={t('dictBook.defaultBadge', { defaultValue: '默认' })}
                >
                  ✓
                </span>
              )}
              <code className="dict-swatch-code">{value.dictValue}</code>
            </span>
          )
        })}
        {previewItems.length > CHIP_LIMIT && (
          <span className="self-center text-xs text-muted-foreground">
            {t('dictBook.moreValues', { count: previewItems.length - CHIP_LIMIT })}
          </span>
        )}
        {previewItems.length === 0 && (
          <span className="text-xs text-muted-foreground">{t('dictBook.noEnabledValues')}</span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-foreground">
            <span
              className={cn(
                'size-1.5 rounded-full',
                type.status === 1 ? 'bg-success' : 'bg-muted-foreground/50',
              )}
              aria-hidden="true"
            />
            {type.status === 1
              ? t('dictBook.statusEnabled', { defaultValue: '正常' })
              : t('dictBook.typeDisabled')}
          </span>
          {type.remark && <span className="truncate">{type.remark}</span>}
        </div>
        <DictCollapsedQuickActions type={type} onManage={onOpen} />
      </div>
    </article>
  )
}

interface ValueDraftState {
  mode: 'create' | 'edit'
  rowId: string | null
  dictLabel: string
  dictValue: string
  sort: number
  status: number
  tagTone: DictTone
  isDefault: number
  remark: string
}

function DictValues({
  type,
  initialItems,
  active,
  motionEnabled,
  onBusyChange,
  onTypeBusyChange,
  onTotalChange,
  onTypeChanged,
}: {
  type: DictTypeRow
  initialItems?: readonly DictValueRow[]
  active: boolean
  motionEnabled: boolean
  onBusyChange: (busy: boolean) => void
  onTypeBusyChange: (busy: boolean) => void
  onTotalChange: (total: number | null) => void
  onTypeChanged: (change: DictTypeChange) => void
}) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const canEdit = useAuthStore((state) => state.perms.includes('system:dict:edit'))
  const [inlineDraft, setInlineDraft] = useState<ValueDraftState | null>(null)
  const [deleting, setDeleting] = useState<DictValueRow | null>(null)
  const [editingType, setEditingType] = useState(false)
  const [typeDraft, setTypeDraft] = useState(() => ({
    dictName: type.dictName,
    dictType: type.dictType,
    status: type.status,
    remark: type.remark ?? '',
  }))
  const [deletingType, setDeletingType] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DICT_VALUE_PAGE_SIZE)
  const [result, setResult] = useState<{
    id: string
    label: string
    action: 'saved' | 'enabled' | 'disabled' | 'deleted'
    sequence: number
  } | null>(null)

  const values = useQuery({
    queryKey: ['system', 'dict', 'book', 'values', type.dictType, page, pageSize],
    queryFn: ({ signal }) => pageDictValues(type.dictType, page, signal, pageSize),
    placeholderData: (previousData): PageResult<DictValueRow> | undefined => {
      if (previousData !== undefined) return previousData
      if (page === 1 && initialItems !== undefined) {
        return {
          list: initialItems.slice(0, pageSize),
          total: initialItems.length,
          page: 1,
          size: pageSize,
        }
      }
      return undefined
    },
    enabled: active,
  })

  const denial = useResourceDenial({
    errors: [values.error],
    clear: { queryKey: ['system', 'dict', 'book', 'values', type.dictType] },
    reset: () => {
      setInlineDraft(null)
      setDeleting(null)
      setEditingType(false)
      setDeletingType(false)
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

  const localKey = JSON.stringify([
    type.id,
    type.dictType,
    inlineDraft?.mode,
    inlineDraft?.rowId,
    deleting?.id,
    editingType,
    deletingType,
  ])

  const save = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run, draftPayload: ValueDraftState) =>
      run({
        scope: undefined,
        requiredPerms: [draftPayload.mode === 'edit' ? 'system:dict:edit' : 'system:dict:add'],
        execute: async (transport) => {
          const payload = {
            dictType: type.dictType,
            dictLabel: draftPayload.dictLabel.trim(),
            dictValue: draftPayload.dictValue.trim(),
            sort: draftPayload.sort,
            status: draftPayload.status,
            tagTone: draftPayload.tagTone,
            isDefault: draftPayload.isDefault,
            remark: draftPayload.remark.trim() || null,
          }
          if (draftPayload.mode === 'edit' && draftPayload.rowId) {
            await updateDictValue(draftPayload.rowId, payload, transport)
            return draftPayload.rowId
          }
          return createDictValue(payload, transport)
        },
      }),
    onSuccess: (id, draftPayload) => {
      toast.success(t('dictBook.saved'))
      showResult(id, draftPayload.dictLabel.trim(), 'saved')
      updateCachedRow(id, (row) => ({
        ...row,
        dictLabel: draftPayload.dictLabel.trim(),
        dictValue: draftPayload.dictValue.trim(),
        sort: draftPayload.sort,
        status: draftPayload.status,
        tagTone: draftPayload.tagTone,
        isDefault: draftPayload.isDefault,
        remark: draftPayload.remark.trim() || null,
      }))
      setInlineDraft(null)
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })

  const patchRowMeta = useModuleMutation(undefined, {
    localKey: JSON.stringify([type.id, type.dictType, 'patch-meta']),
    onDenied: denial,
    mutationFn: (
      run,
      input: {
        row: DictValueRow
        status?: number
        tagTone?: DictTone
        isDefault?: number
      },
    ) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dict:edit'],
        execute: (transport) =>
          updateDictValue(
            input.row.id,
            {
              dictType: input.row.dictType,
              dictLabel: input.row.dictLabel,
              dictValue: input.row.dictValue,
              sort: input.row.sort ?? 0,
              remark: input.row.remark,
              status: input.status ?? input.row.status,
              tagTone: input.tagTone ?? input.row.tagTone ?? 'NEUTRAL',
              isDefault: input.isDefault ?? input.row.isDefault ?? 0,
            },
            transport,
          ),
      }),
    onSuccess: (_data, input) => {
      const nextStatus = input.status ?? input.row.status
      const nextTone = input.tagTone ?? input.row.tagTone ?? 'NEUTRAL'
      const nextDefault = input.isDefault ?? input.row.isDefault ?? 0
      updateCachedRow(input.row.id, (current) => ({
        ...current,
        status: nextStatus,
        tagTone: nextTone,
        isDefault: nextDefault,
      }))
      const action =
        input.status !== undefined ? (nextStatus === 1 ? 'enabled' : 'disabled') : 'saved'
      showResult(input.row.id, input.row.dictLabel, action)
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

  const saveTypeInline = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dict:edit'],
        execute: (transport) =>
          updateDictType(
            type.id,
            {
              dictName: typeDraft.dictName.trim(),
              dictType: typeDraft.dictType.trim(),
              status: typeDraft.status,
              remark: typeDraft.remark.trim() || null,
            },
            transport,
          ),
      }),
    onSuccess: () => {
      toast.success(t('dictBook.typeSaved'))
      setEditingType(false)
      onTypeChanged({
        id: type.id,
        dictType: typeDraft.dictType.trim(),
        name: typeDraft.dictName.trim(),
        action: 'updated',
        row: {
          id: type.id,
          dictType: typeDraft.dictType.trim(),
          dictName: typeDraft.dictName.trim(),
          status: typeDraft.status,
          remark: typeDraft.remark.trim() || null,
        },
      })
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })

  const toggleTypeStatus = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dict:edit'],
        execute: (transport) =>
          updateDictType(type.id, { ...type, status: type.status === 1 ? 0 : 1 }, transport),
      }),
    onSuccess: () => {
      onTypeChanged({
        id: type.id,
        dictType: type.dictType,
        name: type.dictName,
        action: type.status === 1 ? 'disabled' : 'enabled',
        row: { ...type, status: type.status === 1 ? 0 : 1 },
      })
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })

  const removeType = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dict:remove'],
        execute: (transport) => deleteDictType(type.id, transport),
      }),
    onSuccess: () => {
      toast.success(t('dictBook.typeDeleted'))
      setDeletingType(false)
      onTypeChanged({
        id: type.id,
        dictType: type.dictType,
        name: type.dictName,
        action: 'deleted',
      })
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.deleteFailed')),
  })

  const valuePending = save.isPending || patchRowMeta.isPending || remove.isPending
  const typePending = saveTypeInline.isPending || toggleTypeStatus.isPending || removeType.isPending
  const busy = inlineDraft !== null || deleting !== null || valuePending
  const typeBusy = editingType || deletingType || typePending

  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])

  useEffect(() => {
    onTypeBusyChange(typeBusy)
    return () => onTypeBusyChange(false)
  }, [typeBusy, onTypeBusyChange])

  const liveTotal = values.data?.total ?? null
  useEffect(() => {
    onTotalChange(liveTotal)
    return () => onTotalChange(null)
  }, [liveTotal, onTotalChange])

  const pages = lastDictionaryPage(values.data?.total ?? 0, pageSize)
  if (values.data && !values.isPlaceholderData && page > pages) setPage(pages)

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

  const startCreateInline = () => {
    setInlineDraft({
      mode: 'create',
      rowId: null,
      dictLabel: '',
      dictValue: '',
      sort: (rows.length + 1) * 10,
      status: 1,
      tagTone: 'NEUTRAL',
      isDefault: 0,
      remark: '',
    })
  }

  const startEditInline = (row: DictValueRow) => {
    setInlineDraft({
      mode: 'edit',
      rowId: row.id,
      dictLabel: row.dictLabel,
      dictValue: row.dictValue,
      sort: row.sort ?? 0,
      status: row.status,
      tagTone: resolveDictSwatchTone(type.dictType, row),
      isDefault: row.isDefault ?? 0,
      remark: row.remark ?? '',
    })
  }

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
            disabled={busy || typeBusy || values.isPlaceholderData}
            onClick={startCreateInline}
          >
            <Plus aria-hidden="true" />
            {t('dictBook.addValue')}
          </Button>
        </Perm>
      </div>

      {/* Inline create row inside the expanded card */}
      {inlineDraft?.mode === 'create' && (
        <InlineValueEditorRow
          draft={inlineDraft}
          submitting={save.isPending}
          onChange={setInlineDraft}
          onCancel={() => setInlineDraft(null)}
          onSubmit={() => {
            if (!inlineDraft.dictLabel.trim() || !inlineDraft.dictValue.trim()) {
              toast.error(t('dictBook.requiredFields', { defaultValue: '请填写字典标签与编码值' }))
              return
            }
            save.mutate(inlineDraft)
          }}
        />
      )}

      {rows.length === 0 && !values.isError ? (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          {t('dictBook.noValues')}
        </p>
      ) : (
        <div
          role="region"
          tabIndex={0}
          aria-label={t('dictBook.valuesRegion', {
            name: type.dictName,
            defaultValue: `${type.dictName}字典项列表`,
          })}
          className="dict-values-table overflow-x-auto rounded-panel border border-border-subtle bg-card/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
        >
          <div aria-hidden="true" className="dict-values-head">
            <span>{t('dictBook.colLabel', { defaultValue: '标签预览' })}</span>
            <span>{t('dictBook.colKey', { defaultValue: '存储键值' })}</span>
            <span>{t('dictBook.colSort', { defaultValue: '排序' })}</span>
            <span>{t('dictBook.colPalette', { defaultValue: '语义色阶' })}</span>
            <span>{t('dictBook.colDefault', { defaultValue: '默认项' })}</span>
            <span className="text-right">
              {t('dictBook.colActions', { defaultValue: '状态 / 操作' })}
            </span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {rows.map((row) => {
              const isEditingRow = inlineDraft?.mode === 'edit' && inlineDraft.rowId === row.id
              if (isEditingRow && inlineDraft) {
                return (
                  <li key={row.id} className="p-2.5">
                    <InlineValueEditorRow
                      draft={inlineDraft}
                      submitting={save.isPending}
                      onChange={setInlineDraft}
                      onCancel={() => setInlineDraft(null)}
                      onSubmit={() => {
                        if (!inlineDraft.dictLabel.trim() || !inlineDraft.dictValue.trim()) {
                          toast.error(
                            t('dictBook.requiredFields', {
                              defaultValue: '请填写字典标签与编码值',
                            }),
                          )
                          return
                        }
                        save.mutate(inlineDraft)
                      }}
                    />
                  </li>
                )
              }
              const tone = resolveDictSwatchTone(type.dictType, row)
              return (
                <li
                  key={row.id}
                  className="dict-value-row"
                  data-value-result={result?.id === row.id || undefined}
                >
                  <div className="min-w-0">
                    <span
                      className="dict-swatch-chip"
                      data-tone={tone}
                      data-disabled={row.status !== 1 ? 'true' : undefined}
                    >
                      <span className="dict-swatch-dot-indicator" aria-hidden="true" />
                      <span className="font-medium">{row.dictLabel}</span>
                      {row.isDefault === 1 && <span className="dict-swatch-default">✓</span>}
                    </span>
                    {row.remark && (
                      <span
                        className="mt-0.5 block truncate text-[11px] text-muted-foreground"
                        title={row.remark}
                      >
                        {row.remark}
                      </span>
                    )}
                  </div>

                  <code className="w-fit rounded-sm bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {row.dictValue}
                  </code>

                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {t('dictBook.sort', { sort: row.sort ?? 0 })}
                  </span>

                  {/* 6-color semantic swatch picker (CT-06) */}
                  <div
                    role="group"
                    aria-label={t('dictBook.toneGroup', {
                      label: row.dictLabel,
                      defaultValue: `${row.dictLabel} 语义色值`,
                    })}
                    className="flex items-center gap-1"
                  >
                    {DICT_TONES.map((swatchTone) => (
                      <button
                        key={swatchTone}
                        type="button"
                        data-slot="dict-tone-dot"
                        data-tone={swatchTone}
                        data-active={tone === swatchTone ? 'true' : undefined}
                        aria-label={`${row.dictLabel}: ${TONE_LABELS[swatchTone]}`}
                        aria-pressed={tone === swatchTone}
                        disabled={!canEdit || busy || typeBusy || values.isPlaceholderData}
                        onClick={() => patchRowMeta.mutate({ row, tagTone: swatchTone })}
                        className="dict-tone-picker-dot disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    ))}
                  </div>

                  {/* Default item toggle button */}
                  <Button
                    type="button"
                    size="sm"
                    variant={row.isDefault === 1 ? 'secondary' : 'ghost'}
                    disabled={!canEdit || busy || typeBusy || values.isPlaceholderData}
                    onClick={() =>
                      patchRowMeta.mutate({
                        row,
                        isDefault: row.isDefault === 1 ? 0 : 1,
                      })
                    }
                    className="h-7 w-fit px-2 text-xs"
                  >
                    {row.isDefault === 1
                      ? t('dictBook.defaultActive', { defaultValue: '默认 ✓' })
                      : t('dictBook.setDefault', { defaultValue: '设为默认' })}
                  </Button>

                  <div className="flex items-center justify-end gap-1.5">
                    <Switch
                      checked={row.status === 1}
                      disabled={!canEdit || busy || typeBusy || values.isPlaceholderData}
                      aria-label={t('dictBook.toggle', { label: row.dictLabel })}
                      onCheckedChange={() =>
                        patchRowMeta.mutate({ row, status: row.status === 1 ? 0 : 1 })
                      }
                    />

                    <Perm perm="system:dict:edit">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('dictBook.edit', { label: row.dictLabel })}
                        disabled={busy || typeBusy || values.isPlaceholderData}
                        onClick={() => startEditInline(row)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    </Perm>
                    <Perm perm="system:dict:remove">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('dictBook.delete', { label: row.dictLabel })}
                        disabled={busy || typeBusy || values.isPlaceholderData}
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </Perm>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {values.data && (
        <DynaPagination
          ariaLabel={t('dictBook.valuePages', { name: type.dictName })}
          page={Math.min(page, pages)}
          size={pageSize}
          total={values.data.total}
          disabled={busy || typeBusy || values.isFetching}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize)
            setPage(1)
          }}
        />
      )}

      {/* Expanded card bottom bar: Type status + In-place Type Edit / Toggle / Delete (frame 0999.jpg) */}
      <div className="border-t border-border-subtle pt-3">
        {editingType ? (
          <div className="flex flex-wrap items-center gap-2 rounded-control bg-muted/60 p-2.5">
            <Input
              value={typeDraft.dictName}
              onChange={(event) =>
                setTypeDraft((prev) => ({ ...prev, dictName: event.target.value }))
              }
              placeholder={t('dictBook.typeNamePlaceholder', { defaultValue: '字典名称' })}
              aria-label={t('dictBook.typeNamePlaceholder', { defaultValue: '字典名称' })}
              className="h-8 max-w-44 text-xs"
              disabled={saveTypeInline.isPending}
            />
            <Input
              value={typeDraft.dictType}
              onChange={(event) =>
                setTypeDraft((prev) => ({ ...prev, dictType: event.target.value }))
              }
              placeholder={t('dictBook.typeCodePlaceholder', { defaultValue: '字典类型编码' })}
              aria-label={t('dictBook.typeCodePlaceholder', { defaultValue: '字典类型编码' })}
              className="h-8 max-w-48 font-mono text-xs"
              disabled={saveTypeInline.isPending}
            />
            <Input
              value={typeDraft.remark}
              onChange={(event) =>
                setTypeDraft((prev) => ({ ...prev, remark: event.target.value }))
              }
              placeholder={t('dictBook.remarkPlaceholder', { defaultValue: '备注说明' })}
              aria-label={t('dictBook.remarkPlaceholder', { defaultValue: '备注说明' })}
              className="h-8 min-w-40 flex-1 text-xs"
              disabled={saveTypeInline.isPending}
            />
            <Button
              size="sm"
              disabled={
                saveTypeInline.isPending || !typeDraft.dictName.trim() || !typeDraft.dictType.trim()
              }
              onClick={() => saveTypeInline.mutate(undefined)}
            >
              <Check aria-hidden="true" />
              {t('dictBook.saveInline', { defaultValue: '保存类型' })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saveTypeInline.isPending}
              onClick={() => setEditingType(false)}
            >
              <X aria-hidden="true" />
              {t('dictBook.cancel')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    type.status === 1 ? 'bg-success' : 'bg-muted-foreground/50',
                  )}
                  aria-hidden="true"
                />
                {type.status === 1
                  ? t('dictBook.statusEnabled', { defaultValue: '正常' })
                  : t('dictBook.typeDisabled')}
              </span>
              {type.remark && <span>· {type.remark}</span>}
            </div>
            <div className="flex items-center gap-1">
              <Perm perm="system:dict:edit">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  aria-label={t('dictBook.editType', { name: type.dictName })}
                  disabled={busy || typeBusy}
                  onClick={() => {
                    setTypeDraft({
                      dictName: type.dictName,
                      dictType: type.dictType,
                      status: type.status,
                      remark: type.remark ?? '',
                    })
                    setEditingType(true)
                  }}
                >
                  <Pencil aria-hidden="true" />
                  {t('dictBook.editTypeShort', { defaultValue: '编辑类型' })}
                </Button>
              </Perm>
              <Perm perm="system:dict:edit">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  aria-label={t(
                    type.status === 1 ? 'dictBook.disableType' : 'dictBook.enableType',
                    { name: type.dictName },
                  )}
                  disabled={busy || typeBusy}
                  onClick={() => toggleTypeStatus.mutate(undefined)}
                >
                  <Power aria-hidden="true" />
                  {type.status === 1
                    ? t('dictBook.disableShort', { defaultValue: '停用类型' })
                    : t('dictBook.enableShort', { defaultValue: '启用类型' })}
                </Button>
              </Perm>
              <Perm perm="system:dict:remove">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive"
                  aria-label={t('dictBook.deleteType', { name: type.dictName })}
                  disabled={busy || typeBusy}
                  onClick={() => setDeletingType(true)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </Perm>
            </div>
          </div>
        )}
      </div>

      {/* Delete dictionary value confirmation */}
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

      {/* Delete dictionary type confirmation */}
      <AlertDialog
        open={deletingType}
        onOpenChange={(open) => !open && !removeType.isPending && setDeletingType(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dictBook.deleteTypeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dictBook.deleteTypeHint', { name: type.dictName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeType.isPending}>
              {t('dictBook.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeType.isPending}
              onClick={(event) => {
                event.preventDefault()
                removeType.mutate(undefined)
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

function InlineValueEditorRow({
  draft,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: ValueDraftState
  submitting: boolean
  onChange: (next: ValueDraftState) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation('system')
  return (
    <div
      data-slot="dict-inline-editor"
      className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-muted/50 p-2.5"
    >
      <Input
        value={draft.dictLabel}
        onChange={(event) => onChange({ ...draft, dictLabel: event.target.value })}
        placeholder={t('dictBook.labelPlaceholder', { defaultValue: '显示标签（如：男）' })}
        aria-label={t('dictBook.labelPlaceholder', { defaultValue: '显示标签' })}
        className="h-8 max-w-36 text-xs"
        disabled={submitting}
      />
      <Input
        value={draft.dictValue}
        onChange={(event) => onChange({ ...draft, dictValue: event.target.value })}
        placeholder={t('dictBook.valuePlaceholder', { defaultValue: '编码值（如：1）' })}
        aria-label={t('dictBook.valuePlaceholder', { defaultValue: '编码值' })}
        className="h-8 max-w-32 font-mono text-xs"
        disabled={submitting}
      />
      <Input
        type="number"
        value={String(draft.sort)}
        onChange={(event) => onChange({ ...draft, sort: Number(event.target.value) || 0 })}
        placeholder={t('dictBook.sortPlaceholder', { defaultValue: '排序' })}
        aria-label={t('dictBook.sortPlaceholder', { defaultValue: '排序' })}
        className="h-8 w-20 font-mono text-xs"
        disabled={submitting}
      />
      <Input
        value={draft.remark}
        onChange={(event) => onChange({ ...draft, remark: event.target.value })}
        placeholder={t('dictBook.remarkPlaceholder', { defaultValue: '备注说明（可选）' })}
        aria-label={t('dictBook.remarkPlaceholder', { defaultValue: '备注说明' })}
        className="h-8 min-w-32 flex-1 text-xs"
        disabled={submitting}
      />
      <div className="flex items-center gap-1" role="group" aria-label="选择语义色">
        {DICT_TONES.map((swatchTone) => (
          <button
            key={swatchTone}
            type="button"
            data-tone={swatchTone}
            data-active={draft.tagTone === swatchTone ? 'true' : undefined}
            aria-label={TONE_LABELS[swatchTone]}
            aria-pressed={draft.tagTone === swatchTone}
            disabled={submitting}
            onClick={() => onChange({ ...draft, tagTone: swatchTone })}
            className="dict-tone-picker-dot"
          />
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant={draft.isDefault === 1 ? 'secondary' : 'ghost'}
        className="h-7 px-2 text-xs"
        disabled={submitting}
        onClick={() => onChange({ ...draft, isDefault: draft.isDefault === 1 ? 0 : 1 })}
      >
        {draft.isDefault === 1 ? '默认 ✓' : '设为默认'}
      </Button>
      <Button type="button" size="sm" className="h-8" disabled={submitting} onClick={onSubmit}>
        <Check aria-hidden="true" />
        {t('dictBook.saveInlineValue', { defaultValue: '保存' })}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8"
        disabled={submitting}
        onClick={onCancel}
      >
        <X aria-hidden="true" />
        {t('dictBook.cancel')}
      </Button>
    </div>
  )
}

function DictCollapsedQuickActions({
  type,
  onManage,
}: {
  type: DictTypeRow
  onManage: () => void
}) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refresh = () =>
    client.invalidateQueries({ predicate: (query) => isDictionaryQuery(query.queryKey) })

  const toggleStatus = useModuleMutation(undefined, {
    localKey: JSON.stringify([type.id, 'collapsed-toggle']),
    mutationFn: (run) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dict:edit'],
        execute: (transport) =>
          updateDictType(type.id, { ...type, status: type.status === 1 ? 0 : 1 }, transport),
      }),
    onSuccess: () => {
      toast.success(
        type.status === 1
          ? t('dictBook.typeDisabledToast', { defaultValue: '已停用字典类型' })
          : t('dictBook.typeEnabledToast', { defaultValue: '已启用字典类型' }),
      )
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.saveFailed')),
  })

  const removeType = useModuleMutation(undefined, {
    localKey: JSON.stringify([type.id, 'collapsed-remove']),
    mutationFn: (run) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dict:remove'],
        execute: (transport) => deleteDictType(type.id, transport),
      }),
    onSuccess: () => {
      toast.success(t('dictBook.typeDeletedToast', { defaultValue: '字典类型已删除' }))
      setConfirmDelete(false)
      void refresh()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('dictBook.deleteFailed')),
  })

  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Perm perm="system:dict:edit">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={`管理字典：${type.dictName}`}
          title="管理字典项"
          disabled={toggleStatus.isPending || removeType.isPending}
          onClick={(event) => {
            event.stopPropagation()
            onManage()
          }}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </Button>
      </Perm>
      <Perm perm="system:dict:edit">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={
            type.status === 1 ? `快速停用：${type.dictName}` : `快速启用：${type.dictName}`
          }
          title={type.status === 1 ? '停用类型' : '启用类型'}
          disabled={toggleStatus.isPending || removeType.isPending}
          onClick={(event) => {
            event.stopPropagation()
            toggleStatus.mutate(undefined)
          }}
        >
          <Power className="size-3.5" aria-hidden="true" />
        </Button>
      </Perm>
      <Perm perm="system:dict:remove">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 text-destructive hover:text-destructive"
          aria-label={`快速删除：${type.dictName}`}
          title="删除类型"
          disabled={toggleStatus.isPending || removeType.isPending}
          onClick={(event) => {
            event.stopPropagation()
            setConfirmDelete(true)
          }}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </Perm>
      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => !open && !removeType.isPending && setConfirmDelete(false)}
      >
        <AlertDialogContent onClick={(event) => event.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dictBook.deleteTypeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dictBook.deleteTypeHint', { name: type.dictName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeType.isPending}>
              {t('dictBook.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeType.isPending}
              onClick={(event) => {
                event.preventDefault()
                removeType.mutate(undefined)
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
