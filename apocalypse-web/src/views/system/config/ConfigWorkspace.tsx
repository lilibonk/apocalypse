/**
 * 参数值工作区：左粘性紧凑语义分组锚点导轨（fit-content）+ 右侧分组类型化参数卡片 +
 * 行内蓝点/划线原值/单项撤销 + 40900 三方冲突对比恢复 + 底部居中深色胶囊未保存事务条。
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { DynaQueryFeedback } from '@/components/dyna'
import { DraftBar } from '@/components/draft/DraftBar'
import { DraftDiffDialog } from '@/components/draft/DraftDiffDialog'
import { LivingContextBar, useEntityIntent } from '@/components/navigation'
import { StickyCompactRailLayout, type CompactRailItem } from '@/components/spatial'
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
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { usePageDraft } from '@/hooks/usePageDraft'
import { ApiError } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

import { ConfigForm } from './ConfigForm'
import schema from './config.schema'
import {
  createConfig,
  deleteConfig,
  getConfigByKey,
  pageConfigs,
  saveConfigValues,
  updateConfig,
  type ConfigRow,
  type ConfigSaveBody,
} from './config.api'
import {
  conflictedIds,
  editDraft,
  inferConfigControl,
  normalizeValue,
  rebaseDraft,
  resolveConfigGroupMeta,
  resolveConflictUseMine,
  resolveConflictUseServer,
  saveItems,
  undoDraft,
  type ConfigDraft,
} from './config-draft.model'
import '@/components/draft/draft.css'
import './config-workspace.css'

const PAGE_SIZE = 20
const MAX_DRAFT = 200
const CONFLICT = 40900
const ALL_GROUPS_KEY = '__all__'

function isConfigQuery({ queryKey }: { queryKey: readonly unknown[] }) {
  return (
    (queryKey[0] === 'system' && queryKey[1] === 'configs') ||
    (queryKey[0] === 'dyna' && queryKey[1] === '/system/configs')
  )
}

export function ConfigWorkspace({
  active = true,
  createOpen = false,
  onCreateOpenChange,
}: {
  active?: boolean
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const canEdit = useAuthStore((state) => state.perms.includes('system:config:edit'))
  const pageDraft = usePageDraft<ConfigDraft>('config-values')
  const [draft, setDraftState] = useState<ConfigDraft>(() => pageDraft.restored ?? {})
  const [restoredNotice] = useState(() => Object.keys(pageDraft.restored ?? {}).length > 0)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [activeGroupKey, setActiveGroupKey] = useState<string>(ALL_GROUPS_KEY)
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({})
  const [highlightedConfigId, setHighlightedConfigId] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<ConfigRow[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<ConfigRow | null>(null)
  const [deletingRow, setDeletingRow] = useState<ConfigRow | null>(null)

  const { intent } = useEntityIntent('config')
  const intentKey = intent
    ? `${intent.id}|${intent.focusTargetId ?? ''}|${intent.groupKey ?? ''}`
    : ''
  const [appliedIntentKey, setAppliedIntentKey] = useState('')
  if (intentKey !== appliedIntentKey) {
    setAppliedIntentKey(intentKey)
    const target = intent?.focusTargetId || intent?.id
    if (target) {
      setHighlightedConfigId(target)
      if (intent?.groupKey) setActiveGroupKey(intent.groupKey)
    }
  }

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

  const saveDefinition = useModuleMutation(undefined, {
    localKey: editingRow ? `edit:${editingRow.id}` : 'create',
    onDenied: denial,
    mutationFn: (run, body: Record<string, unknown>) => {
      const payload: ConfigSaveBody = {
        configKey: String(body.configKey ?? ''),
        configName: String(body.configName ?? ''),
        configValue: body.configValue == null ? null : String(body.configValue),
        remark: body.remark == null ? null : String(body.remark),
        ...(typeof body.expectedVersion === 'number'
          ? { expectedVersion: body.expectedVersion }
          : {}),
      }
      return run({
        scope: undefined,
        requiredPerms: [editingRow ? 'system:config:edit' : 'system:config:add'],
        execute: async (transport) => {
          if (editingRow) {
            await updateConfig(editingRow.id, payload, transport)
          } else {
            await createConfig(payload, transport)
          }
        },
      })
    },
    onSuccess: () => {
      toast.success(editingRow ? '参数定义已更新' : '参数已创建')
      if (editingRow && draft[editingRow.id]) {
        setDraft(undoDraft(draft, editingRow.id))
      }
      setEditingRow(null)
      onCreateOpenChange?.(false)
      void client.invalidateQueries({ predicate: isConfigQuery })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '保存参数失败')
    },
  })

  const removeDefinition = useModuleMutation(undefined, {
    localKey: deletingRow ? `delete:${deletingRow.id}` : '',
    onDenied: denial,
    mutationFn: (run, id: string) =>
      run({
        scope: undefined,
        requiredPerms: ['system:config:remove'],
        execute: (transport) => deleteConfig(id, transport),
      }),
    onSuccess: (_res, id) => {
      toast.success('参数已删除')
      if (draft[id]) {
        setDraft(undoDraft(draft, id))
      }
      setDeletingRow(null)
      void client.invalidateQueries({ predicate: isConfigQuery })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '删除参数失败')
    },
  })

  const filtered = rows
  const displayedPage = configs.data?.page ?? page
  const busy =
    save.isPending || reload.isPending || saveDefinition.isPending || removeDefinition.isPending
  const pages = Math.max(1, Math.ceil((configs.data?.total ?? 0) / PAGE_SIZE))
  if (!configs.isFetching && configs.data && page > pages) setPage(pages)

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: ConfigRow[] }>()
    for (const row of filtered) {
      const meta = resolveConfigGroupMeta(row.configKey)
      const current = map.get(meta.key)
      if (current) {
        current.rows.push(row)
      } else {
        map.set(meta.key, { label: meta.label, rows: [row] })
      }
    }
    return map
  }, [filtered])

  const railItems = useMemo<CompactRailItem[]>(() => {
    const items: CompactRailItem[] = [
      {
        key: ALL_GROUPS_KEY,
        label: '全部分组',
        count: filtered.length,
        dirty: count > 0,
        dirtyCount: count,
        conflict: conflicts.size > 0,
      },
    ]
    for (const [groupKey, groupData] of groups.entries()) {
      const groupDirtyCount = groupData.rows.filter((r) => Boolean(draft[r.id])).length
      const groupHasConflict = groupData.rows.some((r) => conflicts.has(r.id))
      items.push({
        key: groupKey,
        label: groupData.label,
        count: groupData.rows.length,
        dirty: groupDirtyCount > 0,
        dirtyCount: groupDirtyCount,
        conflict: groupHasConflict,
      })
    }
    return items
  }, [conflicts, count, draft, filtered.length, groups])

  const byId = new Map(rows.map((row) => [row.id, row]))
  const diffItems = Object.entries(draft).map(([id, item]) => ({
    key: item.configKey ?? byId.get(id)?.configKey ?? id,
    label: item.configName ?? byId.get(id)?.configName ?? id,
    before: item.baseValue,
    after: item.value,
  }))

  const handleSelectGroup = (groupKey: string) => {
    setActiveGroupKey(groupKey)
    if (groupKey !== ALL_GROUPS_KEY && typeof document !== 'undefined') {
      const target = document.getElementById(`config-group-${groupKey}`)
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  return (
    <div className="config-workspace space-y-4" aria-busy={configs.isFetching || busy}>
      <LivingContextBar source={intent?.source} />
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        {count > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="draft-marker" aria-hidden="true" />
            <span>已改动 {count} 项参数</span>
            {conflicts.size > 0 && <Badge variant="warning">冲突待决策 {conflicts.size}</Badge>}
          </div>
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
          <StickyCompactRailLayout
            railLabel="参数分组锚点"
            railWidth="compact"
            items={railItems}
            activeKey={activeGroupKey}
            onSelect={handleSelectGroup}
            stageClassName="space-y-4"
          >
            {[...groups.entries()].map(([groupKey, groupData]) => {
              const isGroupHighlighted = activeGroupKey === groupKey
              const groupDirtyCount = groupData.rows.filter((r) => Boolean(draft[r.id])).length
              return (
                <section
                  key={groupKey}
                  id={`config-group-${groupKey}`}
                  aria-labelledby={`config-group-heading-${groupKey}`}
                  data-active={isGroupHighlighted ? 'true' : 'false'}
                  data-dirty-group={groupDirtyCount > 0 ? 'true' : undefined}
                  className="config-group sketch-surface rounded-panel border border-border-subtle bg-card transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
                    <div className="flex items-center gap-2">
                      <h2
                        id={`config-group-heading-${groupKey}`}
                        className="text-sm font-semibold text-foreground"
                      >
                        {groupData.label}
                      </h2>
                      <code className="font-mono text-xs text-muted-foreground">{groupKey}</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {groupDirtyCount > 0 && (
                        <Badge variant="default">改动 {groupDirtyCount}</Badge>
                      )}
                      <span className="font-mono tabular-nums">{groupData.rows.length} 项</span>
                    </div>
                  </div>
                  <ul className="divide-y divide-border-subtle">
                    {groupData.rows.map((row) => {
                      const item = draft[row.id]
                      const value = item ? item.value : normalizeValue(row.configValue)
                      const control = inferConfigControl(row, value)
                      const inputId = `config-value-${row.id}`
                      const conflicted = conflicts.has(row.id)
                      const hasThreeWayConflict = conflicted
                      const serverLatestValue =
                        item?.conflictServerValue !== undefined
                          ? item.conflictServerValue
                          : row.configValue
                      const originBaselineValue =
                        item?.conflictBaseValue !== undefined
                          ? item.conflictBaseValue
                          : item?.baseValue
                      const isDisabled =
                        !canEdit ||
                        busy ||
                        configs.isPlaceholderData ||
                        (!item && count >= MAX_DRAFT)
                      const rowSaved =
                        !item &&
                        lastSaved.some(
                          (saved) =>
                            saved.id === row.id &&
                            saved.version === row.version &&
                            saved.configValue === row.configValue,
                        )
                      const isIntentTarget =
                        highlightedConfigId === row.id || highlightedConfigId === row.configKey

                      return (
                        <li
                          key={row.id}
                          className="config-row grid gap-3 p-4 md:grid-cols-[1fr_1.4fr]"
                          data-saved={rowSaved || undefined}
                          data-dirty={item ? 'true' : undefined}
                          data-conflict={hasThreeWayConflict ? 'true' : undefined}
                          data-intent-highlight={isIntentTarget ? 'true' : undefined}
                        >
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <label
                                htmlFor={inputId}
                                className="flex items-center gap-2 font-medium"
                              >
                                {item && (
                                  <span
                                    className="draft-marker"
                                    aria-label={t('draft.changed', { ns: 'translation' })}
                                  />
                                )}
                                <span className="break-words">{row.configName}</span>
                              </label>
                              <div className="flex shrink-0 items-center gap-0.5">
                                <Perm perm="system:config:edit">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={busy}
                                    aria-label={`编辑定义：${row.configName}`}
                                    onClick={() => setEditingRow(row)}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                </Perm>
                                <Perm perm="system:config:remove">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={busy}
                                    aria-label={`删除参数：${row.configName}`}
                                    onClick={() => setDeletingRow(row)}
                                  >
                                    <Trash2 className="size-3.5 text-destructive" />
                                  </Button>
                                </Perm>
                              </div>
                            </div>
                            <code className="mt-1 block font-mono text-xs break-all text-muted-foreground">
                              {row.configKey}
                            </code>
                            {row.remark && (
                              <p className="mt-1 text-xs break-words text-muted-foreground">
                                {row.remark}
                              </p>
                            )}
                          </div>

                          <div className="min-w-0 space-y-2">
                            {control.kind === 'boolean' ? (
                              <div className="flex items-center justify-between gap-3 rounded-control border border-border-subtle bg-muted/25 px-3 py-1.5">
                                <span className="text-xs text-muted-foreground">
                                  {value.toLowerCase() === 'true'
                                    ? t('configWorkspace.booleanEnabled', {
                                        defaultValue: '布尔开关（已启用 true）',
                                      })
                                    : t('configWorkspace.booleanDisabled', {
                                        defaultValue: '布尔开关（已关闭 false）',
                                      })}
                                </span>
                                <Switch
                                  id={inputId}
                                  aria-label={row.configName}
                                  checked={value.toLowerCase() === 'true'}
                                  disabled={isDisabled}
                                  onCheckedChange={(checked) =>
                                    setDraft(editDraft(draft, row, checked ? 'true' : 'false'))
                                  }
                                />
                              </div>
                            ) : control.kind === 'enum' ? (
                              <SegmentedControl
                                label={row.configName}
                                value={value}
                                onChange={(nextVal) => {
                                  if (!isDisabled) {
                                    setDraft(editDraft(draft, row, String(nextVal)))
                                  }
                                }}
                                options={control.options.map((opt) => ({
                                  value: opt.value,
                                  label: opt.label,
                                }))}
                              />
                            ) : control.kind === 'multiline' ? (
                              <Textarea
                                id={inputId}
                                value={value}
                                maxLength={512}
                                disabled={isDisabled}
                                onChange={(event) =>
                                  setDraft(editDraft(draft, row, event.target.value))
                                }
                              />
                            ) : control.kind === 'secret' ? (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  id={inputId}
                                  type={revealedSecrets[row.id] ? 'text' : 'password'}
                                  value={value}
                                  maxLength={512}
                                  disabled={isDisabled}
                                  onChange={(event) =>
                                    setDraft(editDraft(draft, row, event.target.value))
                                  }
                                  className="flex-1 font-mono"
                                />
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={
                                    revealedSecrets[row.id]
                                      ? t('configWorkspace.hideSecret', {
                                          defaultValue: '隐藏敏感值',
                                        })
                                      : t('configWorkspace.showSecret', {
                                          defaultValue: '显示敏感值',
                                        })
                                  }
                                  onClick={() =>
                                    setRevealedSecrets((prev) => ({
                                      ...prev,
                                      [row.id]: !prev[row.id],
                                    }))
                                  }
                                >
                                  {revealedSecrets[row.id] ? (
                                    <EyeOff className="size-4" aria-hidden="true" />
                                  ) : (
                                    <Eye className="size-4" aria-hidden="true" />
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <Input
                                id={inputId}
                                value={value}
                                maxLength={512}
                                disabled={isDisabled}
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
                                <span className={cn('draft-original font-mono')}>
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

                            {hasThreeWayConflict && item && (
                              <div
                                role="group"
                                aria-label={`${row.configName} 版本冲突对比`}
                                className="space-y-2 rounded-control border border-warning/45 bg-warning/10 p-2.5 text-xs"
                              >
                                <p className="font-medium text-warning-foreground">
                                  {t('configWorkspace.changedElsewhere', {
                                    value:
                                      serverLatestValue ??
                                      t('draft.emptyValue', { ns: 'translation' }),
                                  })}
                                </p>
                                <dl className="grid gap-2 sm:grid-cols-3">
                                  <div className="rounded-sm bg-card/80 p-1.5">
                                    <dt className="text-[11px] text-muted-foreground">
                                      {t('configWorkspace.conflictBase', {
                                        defaultValue: '原基线值',
                                      })}
                                    </dt>
                                    <dd className="mt-0.5 font-mono break-all line-through opacity-75">
                                      {originBaselineValue ??
                                        t('draft.emptyValue', { ns: 'translation' })}
                                    </dd>
                                  </div>
                                  <div className="rounded-sm bg-card/80 p-1.5">
                                    <dt className="text-[11px] text-muted-foreground">
                                      {t('configWorkspace.conflictServer', {
                                        defaultValue: '服务端最新值',
                                      })}
                                    </dt>
                                    <dd className="mt-0.5 font-mono font-medium break-all text-warning-foreground">
                                      {serverLatestValue ??
                                        t('draft.emptyValue', { ns: 'translation' })}
                                    </dd>
                                  </div>
                                  <div className="rounded-sm bg-card/80 p-1.5">
                                    <dt className="text-[11px] text-muted-foreground">
                                      {t('configWorkspace.conflictMine', {
                                        defaultValue: '我的拟改值',
                                      })}
                                    </dt>
                                    <dd className="mt-0.5 font-mono font-medium break-all text-primary">
                                      {item.value || t('draft.emptyValue', { ns: 'translation' })}
                                    </dd>
                                  </div>
                                </dl>
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => {
                                      const next = resolveConflictUseMine(draft, row.id, row)
                                      setDraft(next)
                                      if (conflictedIds(next, rows).size === 0) {
                                        setConflict(null)
                                      }
                                    }}
                                  >
                                    {t('configWorkspace.adoptMine', {
                                      defaultValue: '采用我的值',
                                    })}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => {
                                      const next = resolveConflictUseServer(draft, row.id)
                                      setDraft(next)
                                      if (conflictedIds(next, rows).size === 0) {
                                        setConflict(null)
                                      }
                                    }}
                                  >
                                    {t('configWorkspace.adoptServer', {
                                      defaultValue: '采用服务端值',
                                    })}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </StickyCompactRailLayout>
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
      <DraftDiffDialog
        open={reviewing}
        items={diffItems}
        onOpenChange={setReviewing}
        anchor="bottom-bar"
      />

      {schema.form && (
        <ConfigForm
          config={schema.form}
          mode={editingRow ? 'edit' : 'create'}
          open={createOpen || editingRow !== null}
          initialRow={editingRow ? (editingRow as unknown as Record<string, unknown>) : null}
          submitting={saveDefinition.isPending}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !saveDefinition.isPending) {
              setEditingRow(null)
              onCreateOpenChange?.(false)
            }
          }}
          onSubmit={(body) => saveDefinition.mutate(body)}
        />
      )}

      <AlertDialog
        open={deletingRow !== null}
        onOpenChange={(nextOpen) =>
          !nextOpen && !removeDefinition.isPending && setDeletingRow(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除参数</AlertDialogTitle>
            <AlertDialogDescription>
              将删除参数「{deletingRow?.configName}」（{deletingRow?.configKey}），删除后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeDefinition.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeDefinition.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (deletingRow) removeDefinition.mutate(deletingRow.id)
              }}
            >
              {removeDefinition.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
