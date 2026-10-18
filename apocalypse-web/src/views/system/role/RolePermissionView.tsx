/** Selected role relationships, with an owned menu-editing context. */
import { useLayoutEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Fingerprint,
  Info,
  KeyRound,
  List,
  Network,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'

import { AnimatedNumber } from '@/components/insights/AnimatedNumber'
import { InsightCard } from '@/components/insights/InsightCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'

import { RoleGraphPagination, RolePermissionGraph } from './RolePermissionGraph'
import { RolePermissionEditor } from './RolePermissionEditor'
import { permissionNodeIcons } from './role-permission.icons'
import { createRolePermissionQuery } from './role-permission.queries'
import {
  ROLE_GRAPH_LIST_SIZE,
  canReadRolePermissionGraph,
  rolePermissionPage,
  searchRolePermissionNodes,
  type RolePermissionModel,
  type RolePermissionNode,
  type RolePermissionOpening,
  type RolePermissionTarget,
} from './role-permission.model'
import './role-permission.css'

export function RolePermissionView({
  opening,
  presentation = 'graph',
  onEditingChange,
}: {
  opening: RolePermissionOpening
  presentation?: 'graph' | 'list'
  onEditingChange: (editing: boolean) => void
}) {
  const auth = useAuthStore()
  if (!canReadRolePermissionGraph(auth) || opening.principalEpoch !== auth.sessionEpoch) return null
  return (
    <RolePermissionContent
      key={opening.openId}
      opening={opening}
      presentation={presentation}
      onEditingChange={onEditingChange}
    />
  )
}

function RolePermissionContent({
  opening,
  presentation = 'graph',
  onEditingChange,
}: {
  opening: RolePermissionOpening
  presentation?: 'graph' | 'list'
  onEditingChange: (editing: boolean) => void
}) {
  const { t, i18n } = useTranslation('system')
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh'
  const queryClient = useQueryClient()
  const roleId = opening.role.id
  const openId = opening.openId
  const principalEpoch = opening.principalEpoch
  const [readGeneration, setReadGeneration] = useState(0)
  const resource = useMemo(
    () =>
      createRolePermissionQuery({
        role: { id: roleId },
        openId: `${openId}:read:${readGeneration}`,
        principalEpoch,
      }),
    [roleId, openId, principalEpoch, readGeneration],
  )
  const result = useQuery(resource.options)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [branchPage, setBranchPage] = useState(0)
  const [listPage, setListPage] = useState(0)
  const [editor, setEditor] = useState<{ id: string; nodeId: string | null } | null>(null)
  const auth = useAuthStore()
  const denied = isResourceDenied(result.error)
  useLayoutEffect(() => {
    onEditingChange(editor !== null && !denied)
    return () => onEditingChange(false)
  }, [editor, denied, onEditingChange])
  useLayoutEffect(
    () =>
      useAuthStore.subscribe((current) => {
        if (!current.allScopePerms.includes('system:role:edit')) setEditor(null)
      }),
    [],
  )
  useResourceDenial({
    errors: [result.error],
    clear: resource.filter,
    reset: () => {
      setSelectedId(null)
      setKeyword('')
      setBranchPage(0)
      setListPage(0)
    },
  })
  useLayoutEffect(() => {
    resource.activate()
    return () => {
      resource.deactivate()
      queueMicrotask(() => {
        if (!resource.disposeIfInactive()) return
        void queryClient.cancelQueries(resource.filter, { revert: false })
        queryClient.removeQueries(resource.filter)
      })
    }
  }, [resource, queryClient])

  if (denied || (!result.data && result.error))
    return (
      <div
        className="role-permission-feedback flex flex-col items-center gap-4 p-6 text-center"
        role="alert"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-6" />
        </span>
        <h2 className="text-base font-semibold">
          {t(denied ? 'roleGraph.denied' : 'roleGraph.loadFailed')}
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {result.error instanceof ApiError ? result.error.message : t('roleGraph.loadFailed')}
        </p>
        {denied && (
          <p className="max-w-md text-sm text-muted-foreground">{t('roleGraph.deniedHelp')}</p>
        )}
        <Button
          variant="outline"
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
        >
          <RefreshCw className="size-4" />
          {t('roleGraph.retry')}
        </Button>
      </div>
    )

  if (!result.data)
    return (
      <div className="space-y-5 p-6" role="status">
        <p className="text-sm text-muted-foreground">{t('roleGraph.loading')}</p>
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    )

  const model = result.data
  const selected = selectedId ? (model.byId.get(selectedId) ?? null) : null
  const matches = searchRolePermissionNodes(model, keyword)
  const listed = rolePermissionPage(matches, listPage, ROLE_GRAPH_LIST_SIZE)
  const showGraph = presentation === 'graph' && view === 'graph' && !keyword.trim()
  const onSelect = (id: string | null) => {
    setSelectedId(id)
    setBranchPage(0)
  }
  const reset = () => {
    setSelectedId(null)
    setKeyword('')
    setBranchPage(0)
    setListPage(0)
  }

  if (editor && auth.allScopePerms.includes('system:role:edit'))
    return (
      <RolePermissionEditor
        presentation={presentation}
        key={editor.id}
        opening={{ ...opening, openId: editor.id }}
        initialNodeId={editor.nodeId}
        onResourceDenied={() => {
          // A write 403 can be a narrower data-scope restriction; a 404 can mean the
          // role disappeared. Discard the old projection and let a fresh read decide.
          setEditor(null)
          setSelectedId(null)
          setKeyword('')
          setBranchPage(0)
          setListPage(0)
          setReadGeneration((generation) => generation + 1)
        }}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null)
          void result.refetch()
        }}
      />
    )

  return (
    <div className="role-permission-content min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">{t('roleGraph.configured')}</p>
        <div className="flex flex-wrap items-center gap-2">
          {auth.allScopePerms.includes('system:role:edit') && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const current = useAuthStore.getState()
                if (
                  current.sessionEpoch !== principalEpoch ||
                  !canReadRolePermissionGraph(current) ||
                  !current.allScopePerms.includes('system:role:edit')
                )
                  return
                setEditor({ id: crypto.randomUUID(), nodeId: selected?.id ?? null })
              }}
            >
              <Pencil className="size-4" />
              {t('roleManage.editMenus', { defaultValue: '编辑授权关系' })}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={result.isFetching}
            onClick={() => void result.refetch()}
            aria-label={t('roleGraph.refresh')}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
      {result.error && !denied && (
        <div
          className="flex items-start gap-2 rounded-xl border border-warning px-4 py-3 text-sm text-foreground"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{t('roleGraph.refreshFailed')}</p>
            {result.error instanceof ApiError && (
              <p className="mt-1 text-xs text-muted-foreground">{result.error.message}</p>
            )}
          </div>
        </div>
      )}
      <div className="role-permission-workspace grid min-w-0 gap-5">
        <InsightCard className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label={t('roleGraph.search')}
                placeholder={t('roleGraph.placeholder')}
                className="h-11 rounded-xl pr-10 pl-9"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setListPage(0)
                  setSelectedId(null)
                }}
              />
              {keyword && (
                <button
                  type="button"
                  aria-label={t('roleGraph.clearSearch')}
                  onClick={() => {
                    setKeyword('')
                    setListPage(0)
                  }}
                  className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-xl text-muted-foreground"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>
            <div
              className="role-permission-view flex rounded-xl p-1"
              role="group"
              aria-label={t('roleGraph.view')}
            >
              <button
                type="button"
                aria-pressed={showGraph}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium"
                onClick={() => {
                  setView('graph')
                  setKeyword('')
                  setListPage(0)
                }}
              >
                <Network aria-hidden="true" className="size-3.5" />
                {t('roleGraph.graph')}
              </button>
              <button
                type="button"
                aria-pressed={!showGraph}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium"
                onClick={() => setView('list')}
              >
                <List aria-hidden="true" className="size-3.5" />
                {t('roleGraph.list')}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 rounded-xl"
              aria-label={t('roleGraph.reset')}
              onClick={reset}
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>
          <div
            className="flex flex-wrap items-center gap-1.5 px-5 pt-4 text-xs text-muted-foreground"
            aria-label={t('roleGraph.path')}
          >
            <button
              type="button"
              className="rounded-md px-1 py-1 font-medium text-foreground"
              onClick={() => onSelect(null)}
            >
              {opening.role.roleName}
            </button>
            {selected?.pathIds.map((id) => {
              const node = model.byId.get(id)!
              return (
                <span className="inline-flex max-w-full items-center gap-1.5" key={id}>
                  <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
                  <button
                    type="button"
                    className="min-w-0 break-words rounded-md px-1 py-1"
                    aria-current={id === selected.id ? 'true' : undefined}
                    onClick={() => onSelect(id)}
                  >
                    {node.name}
                  </button>
                </span>
              )
            })}
          </div>
          {showGraph ? (
            <RolePermissionGraph
              model={model}
              role={opening.role}
              selectedId={selected?.id ?? null}
              onSelect={onSelect}
              branchPage={branchPage}
              onBranchPage={setBranchPage}
            />
          ) : (
            <div className="space-y-4 p-4 sm:p-5">
              <p className="text-xs text-muted-foreground" role="status">
                {t('roleGraph.resultCount', { count: matches.length })}
              </p>
              {listed.items.length ? (
                <ul className="space-y-2">
                  {listed.items.map((node) => {
                    const Icon = permissionNodeIcons[node.type]
                    return (
                      <li key={node.id}>
                        <button
                          type="button"
                          className="role-permission-list-node flex w-full items-start gap-3 rounded-2xl border p-3 text-left"
                          aria-label={t('roleGraph.inspect', { name: node.name })}
                          aria-pressed={selected?.id === node.id}
                          onClick={() => onSelect(node.id)}
                        >
                          <span className="role-permission-list-icon flex size-10 shrink-0 items-center justify-center rounded-xl">
                            <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="break-words text-sm font-medium">{node.name}</span>
                              <span
                                className="role-permission-assignment rounded-full px-2 py-0.5 text-xs"
                                data-direct={node.assigned}
                              >
                                {t(node.assigned ? 'roleGraph.direct' : 'roleGraph.context')}
                              </span>
                            </span>
                            <span className="mt-1 block break-words text-xs text-muted-foreground">
                              {node.pathNames.join(' / ')}
                            </span>
                            {node.path && (
                              <code className="mt-2 block break-all text-xs text-muted-foreground">
                                {node.path}
                              </code>
                            )}
                          </span>
                          <ArrowRight
                            aria-hidden="true"
                            className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="role-permission-feedback flex flex-col items-center justify-center gap-3 text-center">
                  <Search aria-hidden="true" className="size-6 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">{t('roleGraph.noMatches')}</h3>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {t('roleGraph.noMatchesHelp')}
                  </p>
                </div>
              )}
              <RoleGraphPagination
                page={listed.page}
                pages={listed.pageCount}
                onPage={setListPage}
              />
            </div>
          )}
          <div className="border-t border-border-subtle px-5 py-4 text-xs text-muted-foreground">
            {model.assignedCount === 0
              ? t('roleManage.noMenus', {
                  defaultValue: '此角色尚未连接菜单，可通过“编辑授权关系”添加。',
                })
              : t('roleManage.relationHint', {
                  defaultValue: '点击节点浏览来源路径，通过“编辑授权关系”调整连接。',
                })}
          </div>
        </InsightCard>
        <RolePermissionSummary
          model={model}
          role={opening.role}
          selected={selected}
          language={language}
        />
      </div>
      <p className="role-permission-explanation flex items-start gap-2 rounded-xl border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{t('roleGraph.explanation')}</span>
      </p>
      {model.unresolvedIds.length > 0 && (
        <section
          className="rounded-2xl border border-border bg-card p-4"
          aria-labelledby="role-permission-unresolved-title"
        >
          <h3 id="role-permission-unresolved-title" className="text-sm font-semibold">
            {t('roleGraph.unresolved', { count: model.unresolvedIds.length })}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t('roleGraph.unresolvedHelp')}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {model.unresolvedIds.map((id) => (
              <li key={id}>
                <code className="block max-w-full break-all rounded-lg bg-muted px-2 py-1 text-xs">
                  {id}
                </code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function RolePermissionSummary({
  model,
  role,
  selected,
  language,
}: {
  model: RolePermissionModel
  role: RolePermissionTarget
  selected: RolePermissionNode | null
  language: 'zh' | 'en'
}) {
  const { t } = useTranslation('system')
  const Icon = selected ? permissionNodeIcons[selected.type] : ShieldCheck
  const displayState = (value: number | null) =>
    t(value === 1 ? 'roleGraph.enabled' : value === 0 ? 'roleGraph.disabled' : 'roleGraph.unknown')
  const dataScope =
    role.dataScope && ['ALL', 'DEPT', 'DEPT_AND_CHILDREN'].includes(role.dataScope)
      ? t(`dataScope.${role.dataScope}`)
      : t('roleGraph.unknown')
  const fields = selected
    ? [
        [t('roleGraph.nodeType'), t(`roleGraph.${selected.type}`)],
        [t('roleGraph.definitionState'), displayState(selected.status)],
        [
          t('roleGraph.visibility'),
          t(
            selected.visible === 1
              ? 'roleGraph.visible'
              : selected.visible === 0
                ? 'roleGraph.hidden'
                : 'roleGraph.unknown',
          ),
        ],
        [t('roleGraph.module'), selected.moduleKey || t('roleGraph.core')],
      ]
    : [
        [t('roleGraph.roleState'), displayState(role.status)],
        [t('roleGraph.dataScope'), dataScope],
      ]

  return (
    <InsightCard className="role-permission-summary min-w-0 self-start overflow-hidden" order={1}>
      <div className="role-permission-summary-header p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-medium text-muted-foreground">{t('roleGraph.summary')}</h2>
          <Fingerprint aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </div>
        <div className="mt-5 text-5xl font-medium tracking-tighter tabular-nums">
          <AnimatedNumber value={model.assignedCount} language={language} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t('roleGraph.assignments')}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border-subtle pt-4">
          <div>
            <dt className="text-xs leading-relaxed text-muted-foreground">
              {t('roleGraph.identifiers')}
            </dt>
            <dd className="mt-1 text-xl font-medium tabular-nums">
              {model.nodes.filter((node) => node.assigned && node.type === 'M').length}
            </dd>
          </div>
          <div>
            <dt className="text-xs leading-relaxed text-muted-foreground">
              {t('roleGraph.sources')}
            </dt>
            <dd className="mt-1 text-xl font-medium tabular-nums">
              {model.nodes.filter((node) => node.assigned && node.type === 'C').length}
            </dd>
          </div>
        </dl>
      </div>
      <div className="space-y-5 p-5" aria-live="polite">
        <div>
          <span className="role-permission-list-icon mb-3 flex size-10 items-center justify-center rounded-xl">
            <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </span>
          <h3 className="break-words text-sm font-semibold">{selected?.name ?? role.roleName}</h3>
          {selected ? (
            <>
              <span
                className="role-permission-assignment mt-2 inline-block rounded-full px-2 py-1 text-xs"
                data-direct={selected.assigned}
              >
                {t(selected.assigned ? 'roleGraph.direct' : 'roleGraph.context')}
              </span>
              {!selected.assigned && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t('roleGraph.contextHelp')}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t('roleGraph.selectNode')}
            </p>
          )}
        </div>
        {selected && (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">{t('roleGraph.path')}</p>
            <ol className="role-permission-source space-y-2 border-l border-border-subtle pl-3">
              <li className="break-words text-xs text-muted-foreground">{role.roleName}</li>
              {selected.pathNames.map((name, index) => (
                <li key={selected.pathIds[index]} className="break-words text-xs">
                  {name}
                </li>
              ))}
            </ol>
          </div>
        )}
        {selected && (
          <div className="role-permission-code rounded-xl border p-3">
            <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <KeyRound aria-hidden="true" className="size-3.5" />
              {t('roleGraph.identifier')}
            </p>
            <code className="block whitespace-pre-wrap break-all text-xs">
              {selected.path || t('roleGraph.noIdentifier')}
            </code>
          </div>
        )}
        <dl className="space-y-3">
          {fields.map(([label, value]) => (
            <div
              className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs"
              key={label}
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="max-w-full break-all text-right">{value}</dd>
            </div>
          ))}
        </dl>
        {selected && (
          <div className="border-t border-border-subtle pt-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('roleGraph.moduleHelp')}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">{t('roleGraph.nodeId')}</p>
            <code className="mt-1 block break-all text-xs">{selected.id}</code>
          </div>
        )}
      </div>
    </InsightCard>
  )
}
