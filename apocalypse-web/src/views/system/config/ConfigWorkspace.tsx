/**
 * 参数值工作区：多项草稿、逐项撤销、差异审阅、原子批量保存与并发冲突处理（桌面与移动共用）。
 * 新增、改键名与删除仍在“参数定义”的 DynaPage 中完成；本区只修改参数值。
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, RotateCcw, Search, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DynaQueryFeedback } from '@/components/dyna'
import type { PageResult } from '@/lib/api/types'
import { DraftBar } from '@/components/draft/DraftBar'
import { DraftDiffDialog } from '@/components/draft/DraftDiffDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { usePageDraft } from '@/hooks/usePageDraft'
import { ApiError } from '@/lib/api/client'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

import { getConfigByKey, pageConfigs, saveConfigValues, type ConfigRow } from './config.api'
import {
  configGroup,
  conflictedIds,
  editDraft,
  normalizeValue,
  rebaseDraft,
  saveItems,
  undoDraft,
  type ConfigDraft,
} from './config-draft.model'
import '@/components/draft/draft.css'
import './config-workspace.css'

const PAGE_SIZE = 20
const MAX_DRAFT = 200
const CONFLICT = 40900

function isConfigQuery({ queryKey }: { queryKey: readonly unknown[] }) {
  return (
    (queryKey[0] === 'system' && queryKey[1] === 'configs') ||
    (queryKey[0] === 'dyna' && queryKey[1] === '/system/configs')
  )
}

export function ConfigWorkspace({ active = true }: { active?: boolean }) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const canEdit = useAuthStore((state) => state.perms.includes('system:config:edit'))
  const pageDraft = usePageDraft<ConfigDraft>('config-values')
  const [draft, setDraftState] = useState<ConfigDraft>(() => pageDraft.restored ?? {})
  const [restoredNotice] = useState(() => Object.keys(pageDraft.restored ?? {}).length > 0)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [lastSaved, setLastSaved] = useState<ConfigRow[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const setDraft = (next: ConfigDraft) => {
    setDraftState(next)
    pageDraft.sync(next, Object.keys(next).length)
  }
  const configs = useQuery({
    queryKey: ['system', 'configs', 'workspace', keyword.trim(), page],
    queryFn: ({ signal }) => pageConfigs(page, PAGE_SIZE, keyword.trim(), signal),
    placeholderData: keepPreviousData,
    enabled: active,
  })
  const denial = useResourceDenial({
    errors: [configs.error],
    clear: { predicate: isConfigQuery },
    reset: () => {
      setReviewing(false)
      setDraft({})
      setLastSaved([])
    },
  })
  const rows = useMemo(
    () => (isResourceDenied(configs.error) ? [] : (configs.data?.list ?? [])),
    [configs.data, configs.error],
  )
  const conflicts = useMemo(() => conflictedIds(draft, rows), [draft, rows])
  const count = Object.keys(draft).length
  const save = useModuleMutation(undefined, {
    localKey: 'config-values',
    onDenied: denial,
    mutationFn: (run, items: ReturnType<typeof saveItems>) =>
      run({
        scope: undefined,
        requiredPerms: ['system:config:edit'],
        execute: (transport) => saveConfigValues(items, transport),
      }),
    onSuccess: (saved) => {
      toast.success(t('configWorkspace.saved', { count: saved.length }))
      setConflict(null)
      setLastSaved(saved)
      const savedById = new Map(saved.map((row) => [row.id, row]))
      client.setQueriesData<PageResult<ConfigRow>>(
        { queryKey: ['system', 'configs', 'workspace'] },
        (current) =>
          current
            ? { ...current, list: current.list.map((row) => savedById.get(row.id) ?? row) }
            : current,
      )
      setDraft({})
      void client.invalidateQueries({ predicate: isConfigQuery })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === CONFLICT) {
        setConflict(error.message)
        return
      }
      toast.error(error instanceof ApiError ? error.message : t('configWorkspace.saveFailed'))
    },
  })
  const reload = useModuleMutation(undefined, {
    localKey: JSON.stringify(draft),
    mutationFn: (run, snapshot: ConfigDraft) =>
      run({
        scope: undefined,
        requiredPerms: ['system:config:list', 'system:config:edit'],
        execute: async (transport) => {
          const results: { row?: ConfigRow; deniedId?: string; message?: string }[] = []
          for (const [id, item] of Object.entries(snapshot)) {
            const key = item.configKey ?? rows.find((row) => row.id === id)?.configKey
            if (!key) throw new ApiError(CONFLICT, t('configWorkspace.findBaseline'))
            try {
              const row = await getConfigByKey(key, transport)
              if (row.id !== id) throw new ApiError(CONFLICT, t('configWorkspace.findBaseline'))
              results.push({ row })
            } catch (error) {
              if (isResourceDenied(error))
                results.push({
                  deniedId: id,
                  message: error instanceof ApiError ? error.message : t('configWorkspace.failed'),
                })
              else throw error
            }
          }
          return results
        },
      }),
    onSuccess: (results, snapshot) => {
      const latest = results.flatMap((result) => (result.row ? [result.row] : []))
      let next = rebaseDraft(snapshot, latest)
      const denied = results.filter((result) => result.deniedId)
      for (const item of denied) next = undoDraft(next, item.deniedId!)
      setDraft(next)
      setConflict(denied.map((item) => item.message).join(' · ') || null)
      const latestById = new Map(latest.map((row) => [row.id, row]))
      client.setQueriesData<PageResult<ConfigRow>>(
        { queryKey: ['system', 'configs', 'workspace'] },
        (current) =>
          current
            ? {
                ...current,
                list: current.list
                  .filter((row) => !denied.some((item) => item.deniedId === row.id))
                  .map((row) => latestById.get(row.id) ?? row),
              }
            : current,
      )
      void client.invalidateQueries({ predicate: isConfigQuery })
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t('configWorkspace.failed')),
  })
  const filtered = rows
  const displayedPage = configs.data?.page ?? page
  const busy = save.isPending || reload.isPending
  const pages = Math.max(1, Math.ceil((configs.data?.total ?? 0) / PAGE_SIZE))
  if (!configs.isFetching && configs.data && page > pages) setPage(pages)
  const groups = new Map<string, ConfigRow[]>()
  for (const row of filtered) {
    const group = configGroup(row.configKey)
    groups.set(group, [...(groups.get(group) ?? []), row])
  }
  const byId = new Map(rows.map((row) => [row.id, row]))
  const diffItems = Object.entries(draft).map(([id, item]) => ({
    key: item.configKey ?? byId.get(id)?.configKey ?? id,
    label: item.configName ?? byId.get(id)?.configName ?? id,
    before: item.baseValue,
    after: item.value,
  }))

  return (
    <div className="config-workspace space-y-4" aria-busy={configs.isFetching || busy}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={keyword}
            disabled={busy}
            onChange={(event) => {
              setKeyword(event.target.value)
              setPage(1)
            }}
            placeholder={t('configWorkspace.search')}
            aria-label={t('configWorkspace.search')}
            className="pl-9"
          />
        </div>
        {!canEdit && (
          <p className="text-xs text-muted-foreground">{t('configWorkspace.readOnly')}</p>
        )}
      </div>
      <DynaQueryFeedback
        error={configs.error}
        hasData={configs.data !== undefined && !isResourceDenied(configs.error)}
        refreshing={configs.isFetching}
        onRetry={() => void configs.refetch()}
      />
      {configs.isPending && <Skeleton className="h-40 w-full" />}
      {configs.isPlaceholderData && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('configWorkspace.loadingPage')}
        </p>
      )}
      {lastSaved.length > 0 && (
        <p
          role="status"
          className="config-save-result flex items-center gap-2 rounded-control border border-border-subtle bg-card p-3 text-sm"
        >
          <Check className="size-4 text-success-foreground" aria-hidden="true" />
          {t('configWorkspace.saved', { count: lastSaved.length })}
        </p>
      )}
      {count >= MAX_DRAFT && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('configWorkspace.limit', { count: MAX_DRAFT })}
        </p>
      )}
      {restoredNotice && count > 0 && (
        <p role="status" className="rounded-control bg-muted p-3 text-sm">
          {t('draft.restored', { ns: 'translation' })}
        </p>
      )}
      {conflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-control border border-border-subtle bg-warning p-3 text-sm text-warning-foreground"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{conflict}</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => reload.mutate(draft)}>
            {reload.isPending
              ? t('configWorkspace.loadingLatest')
              : t('configWorkspace.reloadLatest')}
          </Button>
        </div>
      )}
      {configs.data !== undefined &&
        !isResourceDenied(configs.error) &&
        (filtered.length === 0 ? (
          <p role="status" className="py-10 text-center text-sm text-muted-foreground">
            {keyword ? t('configWorkspace.noMatch') : t('configWorkspace.empty')}
          </p>
        ) : (
          [...groups].map(([group, items]) => (
            <section
              key={group}
              aria-labelledby={`config-group-${group}`}
              className="config-group rounded-panel border border-border-subtle bg-card"
            >
              <h2
                id={`config-group-${group}`}
                className="border-b border-border-subtle px-4 py-3 font-mono text-xs text-muted-foreground"
              >
                {group}
              </h2>
              <ul className="divide-y divide-border-subtle">
                {items.map((row) => {
                  const item = draft[row.id]
                  const value = item ? item.value : normalizeValue(row.configValue)
                  const multiline = value.includes('\n') || value.length > 80
                  const inputId = `config-value-${row.id}`
                  const conflicted = conflicts.has(row.id)
                  const rowSaved =
                    !item &&
                    lastSaved.some(
                      (saved) =>
                        saved.id === row.id &&
                        saved.version === row.version &&
                        saved.configValue === row.configValue,
                    )
                  return (
                    <li
                      key={row.id}
                      className="config-row grid gap-3 p-4 md:grid-cols-[1fr_1.4fr]"
                      data-saved={rowSaved || undefined}
                    >
                      <div className="min-w-0">
                        <label htmlFor={inputId} className="flex items-center gap-2 font-medium">
                          {item && (
                            <span
                              className="draft-marker"
                              aria-label={t('draft.changed', { ns: 'translation' })}
                            />
                          )}
                          <span className="break-words">{row.configName}</span>
                        </label>
                        <code className="mt-1 block font-mono text-xs break-all text-muted-foreground">
                          {row.configKey}
                        </code>
                        {row.remark && (
                          <p className="mt-1 text-xs break-words text-muted-foreground">
                            {row.remark}
                          </p>
                        )}
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        {multiline ? (
                          <Textarea
                            id={inputId}
                            value={value}
                            maxLength={512}
                            disabled={
                              !canEdit ||
                              busy ||
                              configs.isPlaceholderData ||
                              (!item && count >= MAX_DRAFT)
                            }
                            onChange={(event) =>
                              setDraft(editDraft(draft, row, event.target.value))
                            }
                          />
                        ) : (
                          <Input
                            id={inputId}
                            value={value}
                            maxLength={512}
                            disabled={
                              !canEdit ||
                              busy ||
                              configs.isPlaceholderData ||
                              (!item && count >= MAX_DRAFT)
                            }
                            onChange={(event) =>
                              setDraft(editDraft(draft, row, event.target.value))
                            }
                          />
                        )}
                        {item && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted-foreground">
                              {t('configWorkspace.original')}
                            </span>
                            <span className={cn('draft-original')}>
                              {item.baseValue ?? t('draft.emptyValue', { ns: 'translation' })}
                            </span>
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => setDraft(undoDraft(draft, row.id))}
                            >
                              <RotateCcw aria-hidden="true" />
                              {t('draft.undo', { ns: 'translation' })}
                            </Button>
                          </div>
                        )}
                        {rowSaved && (
                          <p className="flex items-center gap-1 text-xs text-success-foreground">
                            <Check className="size-3" aria-hidden="true" />
                            {t('configWorkspace.rowSaved')}
                          </p>
                        )}
                        {conflicted && (
                          <p className="text-xs text-warning-foreground">
                            {t('configWorkspace.changedElsewhere', {
                              value:
                                row.configValue ?? t('draft.emptyValue', { ns: 'translation' }),
                            })}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        ))}
      {configs.data && (
        <nav
          aria-label={t('configWorkspace.pagination')}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3 text-xs text-muted-foreground"
        >
          <span>
            {t('configWorkspace.range', {
              from: configs.data.total ? (displayedPage - 1) * PAGE_SIZE + 1 : 0,
              to: Math.min(displayedPage * PAGE_SIZE, configs.data.total),
              total: configs.data.total,
            })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || configs.isFetching || busy}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft aria-hidden="true" />
              {t('configWorkspace.previous')}
            </Button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || configs.isFetching || busy}
              onClick={() => setPage(page + 1)}
            >
              {t('configWorkspace.next')}
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
      <DraftBar
        count={count}
        saving={busy}
        canSave={canEdit && count <= MAX_DRAFT && !conflict}
        onReview={() => setReviewing(true)}
        onDiscard={() => {
          setDraft({})
          setConflict(null)
        }}
        onSave={() => save.mutate(saveItems(draft))}
      />
      <DraftDiffDialog open={reviewing} items={diffItems} onOpenChange={setReviewing} />
    </div>
  )
}
