/**
 * 参数值工作区：多项草稿、逐项撤销、差异审阅、原子批量保存与并发冲突处理（桌面与移动共用）。
 * 新增、改键名与删除仍在“参数定义”的 DynaPage 中完成；本区只修改参数值。
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Search, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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

import { pageConfigs, saveConfigValues, type ConfigRow } from './config.api'
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

const PAGE_SIZE = 200
const CONFLICT = 40900

export function ConfigWorkspace() {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const canEdit = useAuthStore((state) => state.perms.includes('system:config:edit'))
  const pageDraft = usePageDraft<ConfigDraft>('config-values')
  const [draft, setDraftState] = useState<ConfigDraft>(() => pageDraft.restored ?? {})
  const [restoredNotice] = useState(() => Object.keys(pageDraft.restored ?? {}).length > 0)
  const [keyword, setKeyword] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const setDraft = (next: ConfigDraft) => {
    setDraftState(next)
    pageDraft.sync(next, Object.keys(next).length)
  }
  const configs = useQuery({
    queryKey: ['system', 'configs', 'workspace'],
    queryFn: ({ signal }) => pageConfigs(1, PAGE_SIZE, undefined, signal),
  })
  useResourceDenial({
    errors: [configs.error],
    clear: { queryKey: ['system', 'configs', 'workspace'] },
    reset: () => setReviewing(false),
  })
  const rows = useMemo(
    () => (isResourceDenied(configs.error) ? [] : (configs.data?.list ?? [])),
    [configs.data, configs.error],
  )
  const conflicts = useMemo(() => conflictedIds(draft, rows), [draft, rows])
  const count = Object.keys(draft).length
  const save = useModuleMutation(undefined, {
    localKey: 'config-values',
    mutationFn: (run, items: ReturnType<typeof saveItems>) =>
      run({
        scope: undefined,
        requiredPerms: ['system:config:edit'],
        execute: (transport) => saveConfigValues(items, transport),
      }),
    onSuccess: (saved) => {
      toast.success(t('configWorkspace.saved', { count: saved.length }))
      setConflict(null)
      setDraft({})
      void client.invalidateQueries({ queryKey: ['system', 'configs'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === CONFLICT) {
        setConflict(error.message)
        return
      }
      toast.error(error instanceof ApiError ? error.message : t('configWorkspace.saveFailed'))
    },
  })
  const reloadLatest = async () => {
    const latest = await configs.refetch()
    if (latest.data) setDraft(rebaseDraft(draft, latest.data.list))
    setConflict(null)
  }
  const filtered = rows.filter((row) => {
    const text = keyword.trim().toLowerCase()
    return (
      !text ||
      row.configKey.toLowerCase().includes(text) ||
      row.configName.toLowerCase().includes(text)
    )
  })
  const groups = new Map<string, ConfigRow[]>()
  for (const row of filtered) {
    const group = configGroup(row.configKey)
    groups.set(group, [...(groups.get(group) ?? []), row])
  }
  const byId = new Map(rows.map((row) => [row.id, row]))
  const diffItems = Object.entries(draft).map(([id, item]) => ({
    key: byId.get(id)?.configKey ?? id,
    label: byId.get(id)?.configName ?? id,
    before: item.baseValue,
    after: item.value,
  }))

  if (configs.isPending)
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (configs.isError && rows.length === 0)
    return (
      <div role="alert" className="flex items-center gap-3 rounded-control bg-muted p-3 text-sm">
        <span className="flex-1">
          {configs.error instanceof ApiError ? configs.error.message : t('configWorkspace.failed')}
        </span>
        <Button size="sm" variant="outline" onClick={() => void configs.refetch()}>
          {t('configWorkspace.retry')}
        </Button>
      </div>
    )
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('configWorkspace.search')}
            aria-label={t('configWorkspace.search')}
            className="pl-9"
          />
        </div>
        {configs.data && configs.data.total > PAGE_SIZE && (
          <p className="text-xs text-muted-foreground">
            {t('configWorkspace.truncated', { shown: PAGE_SIZE, total: configs.data.total })}
          </p>
        )}
        {!canEdit && (
          <p className="text-xs text-muted-foreground">{t('configWorkspace.readOnly')}</p>
        )}
      </div>
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
          <Button size="sm" variant="outline" onClick={() => void reloadLatest()}>
            {t('configWorkspace.reloadLatest')}
          </Button>
        </div>
      )}
      {filtered.length === 0 ? (
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
                return (
                  <li key={row.id} className="config-row grid gap-3 p-4 md:grid-cols-[1fr_1.4fr]">
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
                          disabled={!canEdit || save.isPending}
                          onChange={(event) => setDraft(editDraft(draft, row, event.target.value))}
                        />
                      ) : (
                        <Input
                          id={inputId}
                          value={value}
                          maxLength={512}
                          disabled={!canEdit || save.isPending}
                          onChange={(event) => setDraft(editDraft(draft, row, event.target.value))}
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
                            disabled={save.isPending}
                            onClick={() => setDraft(undoDraft(draft, row.id))}
                          >
                            <RotateCcw aria-hidden="true" />
                            {t('draft.undo', { ns: 'translation' })}
                          </Button>
                        </div>
                      )}
                      {conflicted && (
                        <p className="text-xs text-warning-foreground">
                          {t('configWorkspace.changedElsewhere', {
                            value: row.configValue ?? t('draft.emptyValue', { ns: 'translation' }),
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
      )}
      <DraftBar
        count={count}
        saving={save.isPending}
        canSave={canEdit}
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
