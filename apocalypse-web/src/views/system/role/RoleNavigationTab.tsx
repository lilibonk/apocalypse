/** 角色导航菜单分配树表：一屏展示完整层级勾选树，保留自动补全上级目录与未知历史 ID 安全提交语义。 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  RotateCcw,
  Save,
  Search,
  X,
} from 'lucide-react'
import { useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { isAuthorizationCurrent, useAuthStore } from '@/stores/auth'

import {
  buildRolePermissionCatalog,
  createRolePermissionDraft,
  linkRolePermission,
  resetRolePermissionDraft,
  rolePermissionAdditions,
  rolePermissionDraftChanges,
  rolePermissionDraftState,
  undoRolePermissionChange,
  unlinkRolePermission,
  unresolvedRolePermissionIds,
  type RolePermissionCatalog,
  type RolePermissionDraft,
} from './role-permission-draft.model'
import {
  invalidateRoleGraphQueries,
  isRoleGraphConflict,
  saveRoleMenus,
} from './role-graph.operations'
import { permissionNodeIcons } from './role-permission.icons'
import {
  canManageRoleRelations,
  canReadRolePermissionGraph,
  canReadRoleWorkspace,
  type RawRoleMenu,
  type RolePermissionOpening,
} from './role-permission.model'
import { createRoleMenuDraftQuery } from './role-permission.queries'
import { useRoleGraphMutation } from './use-role-graph-mutation'

interface NavSession {
  revision: string
  tree: RawRoleMenu[]
  catalog: RolePermissionCatalog
  draft: RolePermissionDraft
}

interface FlatNavRow {
  id: string
  depth: number
  hasChildren: boolean
}

function filterNavTree(
  tree: readonly RawRoleMenu[],
  keyword: string,
  assignedOnly: boolean,
  selected: ReadonlySet<string>,
): RawRoleMenu[] {
  const kw = keyword.trim().toLocaleLowerCase()
  return tree.flatMap((node) => {
    const children = filterNavTree(node.children ?? [], keyword, assignedOnly, selected)
    const matchKw =
      !kw ||
      [node.menuName, node.path ?? '', node.component ?? '', node.moduleKey ?? '', node.id].some(
        (field) => field.toLocaleLowerCase().includes(kw),
      )
    const matchAssigned = !assignedOnly || selected.has(node.id)
    if ((matchKw && matchAssigned) || children.length > 0) {
      return [{ ...node, children }]
    }
    return []
  })
}

function flattenNavTree(
  tree: readonly RawRoleMenu[],
  collapsed: ReadonlySet<string>,
  depth = 0,
): FlatNavRow[] {
  return tree.flatMap((node) => {
    const children = node.children ?? []
    const hasChildren = children.length > 0
    return [
      { id: node.id, depth, hasChildren },
      ...(hasChildren && !collapsed.has(node.id)
        ? flattenNavTree(children, collapsed, depth + 1)
        : []),
    ]
  })
}

export function RoleNavigationTab({
  opening,
  onDirtyChange,
  onCountChange,
}: {
  opening: RolePermissionOpening
  onDirtyChange?: (dirty: boolean) => void
  onCountChange?: (count: number) => void
}) {
  const auth = useAuthStore()
  if (
    !canReadRoleWorkspace(auth) ||
    auth.sessionEpoch !== opening.principalEpoch ||
    !isAuthorizationCurrent(auth.authorizationEpoch)
  ) {
    return null
  }
  return (
    <RoleNavigationTabContent
      key={`${opening.openId}:${auth.authorizationEpoch}`}
      opening={opening}
      onDirtyChange={onDirtyChange}
      onCountChange={onCountChange}
    />
  )
}

function RoleNavigationTabContent({
  opening,
  onDirtyChange,
  onCountChange,
}: {
  opening: RolePermissionOpening
  onDirtyChange?: (dirty: boolean) => void
  onCountChange?: (count: number) => void
}) {
  const { t } = useTranslation('system')
  const { t: commonT } = useTranslation()
  const client = useQueryClient()
  const auth = useAuthStore()
  const roleId = opening.role.id
  const epoch = opening.principalEpoch
  const [loadId, setLoadId] = useState(() => crypto.randomUUID())

  const canReadMenus = canReadRolePermissionGraph(auth)
  const [session, setSession] = useState<NavSession | null>(null)
  const [loadedKey, setLoadedKey] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [seededExpand, setSeededExpand] = useState(false)
  const [query, setQuery] = useState('')
  const [assignedOnly, setAssignedOnly] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [saveError, setSaveError] = useState<Error | null>(null)

  const canEdit =
    canReadMenus &&
    canManageRoleRelations(auth) &&
    auth.sessionEpoch === epoch &&
    isAuthorizationCurrent(auth.authorizationEpoch) &&
    !accessDenied

  const draftResource = useMemo(
    () =>
      createRoleMenuDraftQuery({
        openId: `${opening.openId}:${loadId}`,
        principalEpoch: epoch,
        role: { id: roleId },
      }),
    [opening.openId, loadId, epoch, roleId],
  )

  const queryResult = useQuery({
    ...draftResource.options,
    enabled: canReadMenus,
  })

  useLayoutEffect(() => {
    draftResource.activate()
    return () => {
      draftResource.deactivate()
      queueMicrotask(() => {
        if (!draftResource.disposeIfInactive()) return
        void client.cancelQueries(draftResource.filter, { revert: false })
        client.removeQueries(draftResource.filter)
      })
    }
  }, [draftResource, client])

  const loadKey = `${roleId}:${loadId}`
  if (queryResult.data && !queryResult.isFetching && loadedKey !== loadKey) {
    setLoadedKey(loadKey)
    const catalog = buildRolePermissionCatalog(queryResult.data.tree)
    const draft = createRolePermissionDraft(queryResult.data.menuIds)
    setSession({
      revision: queryResult.data.revision,
      tree: queryResult.data.tree,
      catalog,
      draft,
    })
    if (!seededExpand) {
      setSeededExpand(true)
      setExpanded(new Set(catalog.nodes.filter((n) => n.children.length > 0).map((n) => n.id)))
    }
  }

  const changes = useMemo(
    () => (session ? rolePermissionDraftChanges(session.draft) : { added: [], removed: [] }),
    [session],
  )
  const dirty = changes.added.length > 0 || changes.removed.length > 0

  useLayoutEffect(() => {
    onDirtyChange?.(dirty && canEdit)
  }, [dirty, canEdit, onDirtyChange])

  useLayoutEffect(() => {
    if (session) onCountChange?.(session.draft.baseline.size)
  }, [session, onCountChange])

  useLayoutEffect(
    () =>
      useAuthStore.subscribe((current) => {
        if (
          !canReadRoleWorkspace(current) ||
          current.sessionEpoch !== epoch ||
          !isAuthorizationCurrent(current.authorizationEpoch)
        ) {
          setAccessDenied(true)
          setSession(null)
          setReviewing(false)
          return
        }
        if (!canManageRoleRelations(current) || !canReadRolePermissionGraph(current)) {
          setSession((prev) =>
            prev ? { ...prev, draft: resetRolePermissionDraft(prev.draft) } : prev,
          )
          setReviewing(false)
          setSaveError(null)
        }
      }),
    [epoch],
  )

  const denial = useResourceDenial({
    errors: [queryResult.error],
    clear: draftResource.filter,
    reset: () => {
      setAccessDenied(true)
      setSession(null)
      setReviewing(false)
    },
  })

  const mutation = useRoleGraphMutation<
    { expectedRevision: string; baselineMenuIds: readonly string[]; menuIds: readonly string[] },
    void
  >({
    requiredPerms: ['system:role:list', 'system:menu:list', 'system:role:edit'],
    requiredAllScopePerms: ['system:role:edit'],
    localKey: `${epoch}:${roleId}:${loadId}`,
    onDenied: denial,
    mutationFn: (variables, transport) => saveRoleMenus(transport, { roleId, ...variables }),
    onSuccess: () => {
      toast.success(t('roleManage.navSaved'))
      setReviewing(false)
      setSaveError(null)
      setLoadId(crypto.randomUUID())
      void invalidateRoleGraphQueries(client, roleId)
    },
    onError: (error) => {
      setReviewing(false)
      setSaveError(error)
    },
  })

  const conflict = isRoleGraphConflict(saveError)
  const disabled = mutation.isPending || conflict || queryResult.isFetching

  const reloadBaseline = () => {
    setSaveError(null)
    setReviewing(false)
    setLoadId(crypto.randomUUID())
  }

  const expandableIds = useMemo(
    () =>
      session ? session.catalog.nodes.filter((n) => n.children.length > 0).map((n) => n.id) : [],
    [session],
  )
  const filtering = query.trim().length > 0 || assignedOnly
  const collapsed = useMemo(
    () =>
      filtering ? new Set<string>() : new Set(expandableIds.filter((id) => !expanded.has(id))),
    [filtering, expandableIds, expanded],
  )

  const filteredTree = useMemo(
    () => (session ? filterNavTree(session.tree, query, assignedOnly, session.draft.selected) : []),
    [session, query, assignedOnly],
  )
  const flatRows = useMemo(() => flattenNavTree(filteredTree, collapsed), [filteredTree, collapsed])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleNodeSelection = (id: string) => {
    if (!session || !canEdit || disabled) return
    setSaveError(null)
    if (session.draft.selected.has(id)) {
      setSession({ ...session, draft: unlinkRolePermission(session.draft, id) })
      return
    }
    const addedCount = rolePermissionAdditions(session.catalog, session.draft, id).length
    if (addedCount > 1) {
      toast.info(t('roleManage.navAncestorsLinked'))
    }
    setSession({ ...session, draft: linkRolePermission(session.catalog, session.draft, id) })
  }

  const undoNodeChange = (id: string) => {
    if (!session || !canEdit || mutation.isPending || conflict) return
    setSession({ ...session, draft: undoRolePermissionChange(session.draft, id) })
  }

  if (!canReadMenus) {
    return (
      <div className="rounded-panel border border-border-subtle bg-card p-6 text-sm text-muted-foreground">
        {t('roleManage.menuUnavailable')}
      </div>
    )
  }

  if (accessDenied || isResourceDenied(queryResult.error)) {
    return (
      <div className="space-y-3 rounded-panel border border-border-subtle bg-card p-6" role="alert">
        <p className="text-sm font-medium">{t('roleManage.editorDenied')}</p>
        <Button variant="outline" size="sm" onClick={reloadBaseline}>
          {t('roleManage.reloadBaseline')}
        </Button>
      </div>
    )
  }

  if (queryResult.isError) {
    return (
      <div className="space-y-3 rounded-panel border border-border-subtle bg-card p-6" role="alert">
        <p className="text-sm font-medium">{t('roleManage.editorLoadFailed')}</p>
        {queryResult.error instanceof ApiError && (
          <p className="text-xs text-muted-foreground">{queryResult.error.message}</p>
        )}
        <Button variant="outline" size="sm" onClick={reloadBaseline}>
          {t('roleManage.reloadBaseline')}
        </Button>
      </div>
    )
  }

  if (!session) {
    return (
      <div role="status" aria-label={t('roleManage.loadingBaseline')} className="space-y-3">
        <Skeleton className="h-12 w-full rounded-panel" />
        <Skeleton className="h-72 w-full rounded-panel" />
      </div>
    )
  }

  const unresolvedIds = unresolvedRolePermissionIds(session.catalog, session.draft)

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div
          role="status"
          className="rounded-control border border-border-subtle bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground"
        >
          {t('authorization.readOnlyNotice')}
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
        >
          <div>
            <p className="font-medium text-destructive">
              {conflict
                ? t('roleManage.conflictHint')
                : saveError instanceof ApiError
                  ? saveError.message
                  : t('roleManage.saveFailed')}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('roleManage.saveFailureHint')}
            </p>
          </div>
          {conflict && (
            <Button variant="outline" size="sm" onClick={reloadBaseline}>
              {t('roleManage.reloadBaseline')}
            </Button>
          )}
        </div>
      )}

      {unresolvedIds.length > 0 && (
        <details className="rounded-control border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            {t('roleManage.unresolvedCount', { count: unresolvedIds.length })} —{' '}
            <span className="font-normal text-muted-foreground">
              {t('roleManage.unresolvedPreserved')}
            </span>
          </summary>
          <ul className="mt-2.5 space-y-1.5">
            {unresolvedIds.map((id) => {
              const kept = session.draft.selected.has(id)
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-card px-2.5 py-1.5"
                >
                  <code className="font-mono">{id}</code>
                  {canEdit && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        setSession({
                          ...session,
                          draft: kept
                            ? unlinkRolePermission(session.draft, id)
                            : undoRolePermissionChange(session.draft, id),
                        })
                      }
                    >
                      {kept
                        ? t('roleManage.removeUnknownLink', { id })
                        : t('roleManage.keepUnknownLink', { id })}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {dirty && canEdit && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-brand-text/40 bg-primary/5 px-4 py-2.5"
        >
          <span className="text-sm font-medium text-foreground">
            {t('roleManage.draftChangesCount', {
              added: changes.added.length,
              removed: changes.removed.length,
            })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => {
                setSession({ ...session, draft: resetRolePermissionDraft(session.draft) })
                setSaveError(null)
              }}
            >
              <RotateCcw className="size-3.5" />
              {t('roleManage.undoAllLinks')}
            </Button>
            <Button type="button" size="sm" disabled={disabled} onClick={() => setReviewing(true)}>
              <Save className="size-3.5" />
              {t('roleManage.navReviewSave')}
            </Button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-panel border border-border-subtle bg-card shadow-surface">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border-subtle bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t('roleManage.searchCandidates')}
                placeholder={t('roleManage.searchCandidates')}
                className="h-8 pl-8 text-xs"
              />
            </div>

            <div
              role="group"
              aria-label={t('authorization.navigation')}
              className="inline-flex h-8 items-center gap-0.5 rounded-control border border-border-subtle bg-muted/60 p-0.5"
            >
              <button
                type="button"
                aria-pressed={!assignedOnly}
                onClick={() => setAssignedOnly(false)}
                className={cn(
                  'inline-flex h-full items-center rounded-md px-2.5 text-xs transition-colors',
                  !assignedOnly
                    ? 'bg-card font-medium text-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {t('roleManage.navFilterAll')}
              </button>
              <button
                type="button"
                aria-pressed={assignedOnly}
                onClick={() => setAssignedOnly(true)}
                className={cn(
                  'inline-flex h-full items-center rounded-md px-2.5 text-xs transition-colors',
                  assignedOnly
                    ? 'bg-card font-medium text-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {t('roleManage.navFilterAssigned')} ({session.draft.selected.size})
              </button>
            </div>

            {filtering && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setQuery('')
                  setAssignedOnly(false)
                }}
              >
                <X className="size-3.5" />
                {t('dyna.重置', { defaultValue: '重置' })}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={filtering || expandableIds.length === 0}
              onClick={() => setExpanded(new Set(expandableIds))}
            >
              <ChevronsUpDown className="size-4" />
              {t('roleManage.navExpandAll')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={filtering || expandableIds.length === 0}
              onClick={() => setExpanded(new Set())}
            >
              <ChevronsDownUp className="size-4" />
              {t('roleManage.navCollapseAll')}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-72">
                  {commonT('common.菜单层级', { defaultValue: '菜单层级' })}
                </TableHead>
                <TableHead className="min-w-48">
                  {commonT('common.路由定义', { defaultValue: '路由与模块' })}
                </TableHead>
                <TableHead className="w-40">
                  {commonT('common.状态', { defaultValue: '状态' })}
                </TableHead>
                <TableHead className="w-20 text-right">
                  {commonT('common.操作', { defaultValue: '操作' })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-28 text-center text-muted-foreground">
                    {assignedOnly ? t('roleManage.noMenus') : t('roleManage.noCandidates')}
                  </TableCell>
                </TableRow>
              )}
              {flatRows.map(({ id, depth, hasChildren }) => {
                const node = session.catalog.byId.get(id)
                if (!node) return null
                const isCollapsed = collapsed.has(id)
                const isSelected = session.draft.selected.has(id)
                const draftState = rolePermissionDraftState(session.draft, id)
                const NodeIcon = permissionNodeIcons[node.type]
                return (
                  <TableRow
                    key={id}
                    data-nav-state={draftState}
                    className={
                      draftState === 'added' || draftState === 'removed'
                        ? 'bg-primary/5'
                        : undefined
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {depth > 0 && (
                          <span
                            aria-hidden="true"
                            className="flex shrink-0 items-center self-stretch"
                          >
                            {Array.from({ length: Math.min(depth, 6) }).map((_, guideIdx) => (
                              <span
                                key={guideIdx}
                                className="inline-block h-6 w-5 border-l border-border-subtle/80"
                              />
                            ))}
                          </span>
                        )}
                        {hasChildren ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0"
                            aria-expanded={!isCollapsed}
                            aria-label={
                              isCollapsed
                                ? commonT('common.展开', { defaultValue: '展开' })
                                : commonT('common.折叠', { defaultValue: '折叠' })
                            }
                            onClick={() => toggleExpand(id)}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="size-3.5" />
                            ) : (
                              <ChevronDown className="size-3.5" />
                            )}
                          </Button>
                        ) : (
                          <span className="size-6 shrink-0" aria-hidden />
                        )}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!canEdit || disabled}
                          aria-label={
                            isSelected
                              ? t('roleManage.removeNamedLink', { name: node.name })
                              : t('roleManage.addNamedLinks', {
                                  name: node.name,
                                  count: Math.max(
                                    1,
                                    rolePermissionAdditions(session.catalog, session.draft, id)
                                      .length,
                                  ),
                                })
                          }
                          className="size-4 shrink-0 cursor-pointer rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                          onChange={() => toggleNodeSelection(id)}
                        />
                        <span className="grid size-6 shrink-0 place-items-center rounded bg-muted text-muted-foreground">
                          <NodeIcon className="size-3.5" aria-hidden="true" />
                        </span>
                        <span className="truncate font-medium">{node.name}</span>
                        <Badge variant="outline" className="shrink-0">
                          {t(`roleGraph.${node.type}`)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        <div className="truncate font-mono text-foreground">{node.path ?? '—'}</div>
                        <div className="truncate text-muted-foreground">
                          {node.moduleKey ?? t('objectWorkspace.core')}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {draftState !== 'unlinked' && (
                          <Badge
                            variant={
                              draftState === 'added'
                                ? 'success'
                                : draftState === 'removed'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {t(
                              draftState === 'added'
                                ? 'roleManage.pendingAdd'
                                : draftState === 'removed'
                                  ? 'roleManage.pendingRemove'
                                  : 'roleManage.linked',
                            )}
                          </Badge>
                        )}
                        {node.visible === 0 && (
                          <Badge variant="outline">
                            {commonT('common.隐藏', { defaultValue: '隐藏' })}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {(draftState === 'added' || draftState === 'removed') && canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={disabled}
                          aria-label={t('roleManage.undoNamedChange', { name: node.name })}
                          onClick={() => undoNodeChange(id)}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <AlertDialog open={reviewing} onOpenChange={setReviewing}>
        <AlertDialogContent className="sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('roleManage.reviewChanges')}</AlertDialogTitle>
            <AlertDialogDescription>{t('roleManage.reviewChangesHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-96 space-y-3 overflow-y-auto py-2">
            {changes.added.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  {t('roleManage.addedCount', { count: changes.added.length })}
                </p>
                <ul className="space-y-1">
                  {changes.added.map((id) => {
                    const node = session.catalog.byId.get(id)
                    return (
                      <li
                        key={`add-${id}`}
                        className="flex items-center justify-between gap-2 rounded-control border border-border-subtle px-3 py-1.5 text-xs"
                      >
                        <span className="truncate">{node ? node.pathNames.join(' / ') : id}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => undoNodeChange(id)}
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {changes.removed.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-destructive">
                  {t('roleManage.removedCount', { count: changes.removed.length })}
                </p>
                <ul className="space-y-1">
                  {changes.removed.map((id) => {
                    const node = session.catalog.byId.get(id)
                    return (
                      <li
                        key={`rm-${id}`}
                        className="flex items-center justify-between gap-2 rounded-control border border-border-subtle px-3 py-1.5 text-xs"
                      >
                        <span className="truncate">{node ? node.pathNames.join(' / ') : id}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => undoNodeChange(id)}
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t('roleManage.returnToEditing')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || !dirty}
              onClick={(event) => {
                event?.preventDefault()
                mutation.mutate({
                  expectedRevision: session.revision,
                  baselineMenuIds: [...session.draft.baseline],
                  menuIds: [...session.draft.selected],
                })
              }}
            >
              {mutation.isPending ? t('roleManage.savingLinks') : t('roleManage.navSave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
