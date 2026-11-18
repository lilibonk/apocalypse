/** 角色业务权限与数据范围直编表：合并已授权与候选定义，行内直调范围与规则，并发版本与差量校验全保留。 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, RotateCcw, Save, Search, X } from 'lucide-react'
import { useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DynaPagination } from '@/components/dyna'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldOption, FieldSelect } from '@/components/ui/field-select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
import { assertAuthorizationCurrent, isAuthorizationCurrent, useAuthStore } from '@/stores/auth'

import {
  canConfigurePermission,
  type PermissionDefinition,
  type ScopeOverride,
} from '../permission/permission.types'
import { RoleGrantFields } from './RoleGrantFields'
import type { GrantTimeZone } from './grant-time'
import {
  addRoleGrant,
  createRoleGrantDraft,
  grantWindowError,
  grantWindowState,
  removeRoleGrant,
  resetRoleGrantDraft,
  roleGrantChanges,
  roleGrantSubmission,
  undoRoleGrant,
  updateRoleGrant,
  type RoleGrant,
  type RoleGrantDraft,
  type RoleGrantsBaseline,
} from './role-grant.model'
import { saveRoleGrants } from './role-grant.operations'
import {
  createGrantCandidatesQuery,
  createRoleGrantQuery,
  GRANT_PAGE_SIZE,
} from './role-grant.queries'
import { invalidateRoleGraphQueries, isRoleGraphConflict } from './role-graph.operations'
import {
  canManageRoleRelations,
  canReadRoleWorkspace,
  rolePermissionPage,
  type RolePermissionOpening,
} from './role-permission.model'
import { useRoleGraphMutation } from './use-role-graph-mutation'

interface GrantSession {
  source: RoleGrantsBaseline
  draft: RoleGrantDraft
  definitions: ReadonlyMap<string, PermissionDefinition | null>
}

type StatusFilter = 'all' | 'assigned' | 'unassigned'

interface RolePermissionsTabProps {
  opening: RolePermissionOpening
  initialFocusId?: string | null
  onDirtyChange?: (dirty: boolean) => void
  onCountChange?: (count: number) => void
}

function sameDefinitions(
  known: ReadonlyMap<string, PermissionDefinition | null>,
  items: readonly PermissionDefinition[],
): boolean {
  return items.every((definition) => known.get(definition.id) === definition)
}

function mergeDefinitions(
  known: ReadonlyMap<string, PermissionDefinition | null>,
  items: readonly PermissionDefinition[],
): ReadonlyMap<string, PermissionDefinition | null> {
  if (sameDefinitions(known, items)) return known
  const next = new Map(known)
  for (const definition of items) {
    next.set(definition.id, definition)
  }
  return next
}

function moduleLabel(moduleKey: string | null | undefined, coreLabel: string): string {
  return moduleKey ? moduleKey : coreLabel
}

export function RolePermissionsTab({
  opening,
  initialFocusId = null,
  onDirtyChange,
  onCountChange,
}: RolePermissionsTabProps) {
  const auth = useAuthStore()
  if (
    !canReadRoleWorkspace(auth) ||
    auth.sessionEpoch !== opening.principalEpoch ||
    !isAuthorizationCurrent(auth.authorizationEpoch)
  ) {
    return null
  }
  return (
    <RolePermissionsTabContent
      key={`${opening.openId}:${auth.authorizationEpoch}`}
      opening={opening}
      initialFocusId={initialFocusId}
      onDirtyChange={onDirtyChange}
      onCountChange={onCountChange}
    />
  )
}

function RolePermissionsTabContent({
  opening,
  initialFocusId = null,
  onDirtyChange,
  onCountChange,
}: RolePermissionsTabProps) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const auth = useAuthStore()
  const canReadCatalog = auth.perms.includes('system:permission:list')
  const roleId = opening.role.id
  const epoch = opening.principalEpoch
  const [loadId, setLoadId] = useState(() => crypto.randomUUID())
  const [renderedAt] = useState(() => Date.now())

  const [session, setSession] = useState<GrantSession | null>(null)
  const [sessionLoadKey, setSessionLoadKey] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [moduleFilter, setModuleFilter] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [highlightedId] = useState<string | null>(initialFocusId)
  const [ruleTargetId, setRuleTargetId] = useState<string | null>(null)
  const [timeZone, setTimeZone] = useState<GrantTimeZone>('local')
  const [timeErrors, setTimeErrors] = useState<
    Record<string, Partial<Record<'validFrom' | 'validUntil', string>>>
  >({})
  const [reviewing, setReviewing] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [saveError, setSaveError] = useState<Error | null>(null)

  const canEdit =
    canManageRoleRelations(auth) &&
    auth.sessionEpoch === epoch &&
    isAuthorizationCurrent(auth.authorizationEpoch) &&
    !accessDenied

  const baselineResource = useMemo(
    () =>
      createRoleGrantQuery({
        openId: `${opening.openId}:${loadId}`,
        principalEpoch: epoch,
        role: { id: roleId },
      }),
    [opening.openId, loadId, epoch, roleId],
  )
  const candidateResource = useMemo(
    () =>
      createGrantCandidatesQuery(
        { openId: `${opening.openId}:${loadId}`, principalEpoch: epoch, role: { id: roleId } },
        { page: page + 1, keyword, moduleKey: moduleFilter || undefined },
      ),
    [opening.openId, loadId, epoch, roleId, page, keyword, moduleFilter],
  )

  const baselineQuery = useQuery(baselineResource.options)
  const shouldFetchCatalog = canReadCatalog && statusFilter !== 'assigned'
  const candidateQuery = useQuery({
    ...candidateResource.options,
    enabled: shouldFetchCatalog && session !== null,
  })

  useLayoutEffect(() => {
    baselineResource.activate()
    return () => {
      baselineResource.deactivate()
      queueMicrotask(() => {
        if (!baselineResource.disposeIfInactive()) return
        void client.cancelQueries(baselineResource.filter, { revert: false })
        client.removeQueries(baselineResource.filter)
      })
    }
  }, [baselineResource, client])

  useLayoutEffect(() => {
    candidateResource.activate()
    return () => {
      candidateResource.deactivate()
      queueMicrotask(() => {
        if (!candidateResource.disposeIfInactive()) return
        void client.cancelQueries(candidateResource.filter, { revert: false })
        client.removeQueries(candidateResource.filter)
      })
    }
  }, [candidateResource, client])

  const loadKey = `${roleId}:${loadId}`
  if (baselineQuery.data && !baselineQuery.isFetching && sessionLoadKey !== loadKey) {
    setSessionLoadKey(loadKey)
    setSession({
      source: baselineQuery.data,
      draft: createRoleGrantDraft(baselineQuery.data.grants),
      definitions: new Map(
        baselineQuery.data.grants.map((grant) => [grant.permissionId, grant.definition]),
      ),
    })
  } else if (
    session &&
    candidateQuery.data &&
    !sameDefinitions(session.definitions, candidateQuery.data.list)
  ) {
    setSession({
      ...session,
      definitions: mergeDefinitions(session.definitions, candidateQuery.data.list),
    })
  }

  const draft = session?.draft
  const definitions = session?.definitions
  const changes = useMemo(
    () => (draft ? roleGrantChanges(draft) : { added: [], removed: [], updated: [] }),
    [draft],
  )
  const dirty = changes.added.length > 0 || changes.removed.length > 0 || changes.updated.length > 0

  useLayoutEffect(() => {
    onDirtyChange?.(dirty && canEdit)
  }, [dirty, canEdit, onDirtyChange])

  useLayoutEffect(() => {
    if (session) onCountChange?.(session.source.grants.length)
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
          setRuleTargetId(null)
          setTimeErrors({})
          return
        }
        if (!canManageRoleRelations(current)) {
          setSession((previous) =>
            previous ? { ...previous, draft: resetRoleGrantDraft(previous.draft) } : previous,
          )
          setReviewing(false)
          setRuleTargetId(null)
          setTimeErrors({})
          setSaveError(null)
        }
      }),
    [epoch],
  )

  const denial = useResourceDenial({
    errors: [baselineQuery.error],
    clear: baselineResource.filter,
    reset: () => {
      setAccessDenied(true)
      setSession(null)
      setReviewing(false)
      setRuleTargetId(null)
      setTimeErrors({})
    },
  })

  const mutation = useRoleGraphMutation<ReturnType<typeof roleGrantSubmission>, void>({
    requiredPerms: ['system:role:list', 'system:role:edit'],
    requiredAllScopePerms: ['system:role:edit'],
    localKey: `${epoch}:${roleId}:${loadId}`,
    onDenied: denial,
    mutationFn: (submission, transport) => saveRoleGrants(transport, roleId, submission),
    onSuccess: () => {
      toast.success(t('authorization.saved'))
      setReviewing(false)
      setSaveError(null)
      setTimeErrors({})
      setLoadId(crypto.randomUUID())
      void invalidateRoleGraphQueries(client, roleId)
    },
    onError: (error) => {
      setReviewing(false)
      setSaveError(error)
    },
  })

  const currentValid = () => {
    const state = useAuthStore.getState()
    return (
      !accessDenied &&
      canManageRoleRelations(state) &&
      state.sessionEpoch === epoch &&
      isAuthorizationCurrent(state.authorizationEpoch)
    )
  }

  const updateDraft = (updater: (prev: RoleGrantDraft) => RoleGrantDraft) => {
    if (!currentValid() || mutation.isPending || conflict) return
    setSession((previous) =>
      previous ? { ...previous, draft: updater(previous.draft) } : previous,
    )
    setSaveError(null)
  }

  const toggleGrant = (id: string) => {
    const def = definitions?.get(id) ?? null
    updateDraft((prev) =>
      prev.current.has(id)
        ? removeRoleGrant(prev, id)
        : canConfigurePermission(def)
          ? addRoleGrant(prev, id)
          : prev,
    )
    setTimeErrors((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const updateGrantFields = (id: string, patch: Partial<Omit<RoleGrant, 'permissionId'>>) => {
    updateDraft((prev) => updateRoleGrant(prev, id, patch))
  }

  const undoRow = (id: string) => {
    if (!currentValid() || mutation.isPending || conflict) return
    updateDraft((prev) => undoRoleGrant(prev, id))
    setTimeErrors((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const resetAllChanges = () => {
    if (mutation.isPending) return
    setSession((previous) =>
      previous ? { ...previous, draft: resetRoleGrantDraft(previous.draft) } : previous,
    )
    setTimeErrors({})
    setSaveError(null)
    setReviewing(false)
  }

  const reloadBaseline = () => {
    setSaveError(null)
    setTimeErrors({})
    setReviewing(false)
    setRuleTargetId(null)
    setLoadId(crypto.randomUUID())
  }

  const conflict = isRoleGraphConflict(saveError)
  const disabled = mutation.isPending || conflict || baselineQuery.isFetching

  const invalid = (() => {
    if (!draft) return false
    const hasGrantError = [...draft.current.values()].some(
      (grant) => grantWindowError(grant) !== null,
    )
    const hasInputError = Object.entries(timeErrors).some(
      ([id, errs]) => draft.current.has(id) && Object.values(errs).some(Boolean),
    )
    return hasGrantError || hasInputError
  })()

  const moduleOptions = useMemo(() => {
    const keys = new Set<string>()
    if (definitions) {
      for (const def of definitions.values()) {
        if (def) keys.add(def.moduleKey ? def.moduleKey : '__core__')
      }
    }
    return [...keys].sort((a, b) =>
      a === '__core__' ? -1 : b === '__core__' ? 1 : a.localeCompare(b),
    )
  }, [definitions])

  const rowsData = useMemo(() => {
    if (!session) return { items: [] as string[], total: 0, page: 0 }
    const { draft: d, definitions: defs } = session
    const kw = keyword.trim().toLocaleLowerCase()
    const matchesLocal = (id: string) => {
      const def = defs.get(id) ?? null
      if (moduleFilter) {
        const mod = def?.moduleKey ? def.moduleKey : '__core__'
        if (mod !== moduleFilter) return false
      }
      if (!kw) return true
      return [id, def?.name ?? '', def?.code ?? '', def?.resource ?? ''].some((val) =>
        val.toLocaleLowerCase().includes(kw),
      )
    }

    if (statusFilter === 'assigned' || !canReadCatalog) {
      const ids = [...new Set([...d.current.keys(), ...d.baseline.keys()])].filter(matchesLocal)
      const sliced = rolePermissionPage(ids, page, GRANT_PAGE_SIZE)
      return { items: sliced.items, total: sliced.total, page: sliced.page }
    }

    const candidateRows = candidateQuery.data?.list ?? []
    const candidateIds = candidateRows.map((def) => def.id)
    if (statusFilter === 'unassigned') {
      const unassigned = candidateIds.filter((id) => !d.current.has(id))
      return { items: unassigned, total: candidateQuery.data?.total ?? unassigned.length, page }
    }

    const extraAssigned =
      page === 0
        ? [...new Set([...d.current.keys(), ...d.baseline.keys()])].filter(
            (id) => !candidateIds.includes(id) && matchesLocal(id),
          )
        : []
    const merged = [...candidateIds, ...extraAssigned]
    return {
      items: merged,
      total: (candidateQuery.data?.total ?? merged.length) + extraAssigned.length,
      page,
    }
  }, [session, statusFilter, canReadCatalog, candidateQuery.data, keyword, moduleFilter, page])

  if (accessDenied || isResourceDenied(baselineQuery.error)) {
    return (
      <div className="space-y-3 rounded-panel border border-border-subtle bg-card p-6" role="alert">
        <p className="text-sm font-medium">{t('authorization.denied')}</p>
        <Button variant="outline" size="sm" onClick={reloadBaseline}>
          {t('authorization.retry')}
        </Button>
      </div>
    )
  }

  if (baselineQuery.isError) {
    return (
      <div className="space-y-3 rounded-panel border border-border-subtle bg-card p-6" role="alert">
        <p className="text-sm font-medium">{t('authorization.readFailed')}</p>
        {baselineQuery.error instanceof ApiError && (
          <p className="text-xs text-muted-foreground">{baselineQuery.error.message}</p>
        )}
        <Button variant="outline" size="sm" onClick={reloadBaseline}>
          {t('authorization.retry')}
        </Button>
      </div>
    )
  }

  if (!session) {
    return (
      <div role="status" aria-label={t('authorization.readLoading')} className="space-y-3">
        <Skeleton className="h-12 w-full rounded-panel" />
        <Skeleton className="h-72 w-full rounded-panel" />
      </div>
    )
  }

  const ruleDef = ruleTargetId ? (session.definitions.get(ruleTargetId) ?? null) : null
  const ruleGrant = ruleTargetId ? session.draft.current.get(ruleTargetId) : undefined

  const changeRowState = (id: string) => {
    const inBefore = session.draft.baseline.has(id)
    const inAfter = session.draft.current.has(id)
    if (!inBefore && inAfter) return 'added' as const
    if (inBefore && !inAfter) return 'removed' as const
    if (inBefore && inAfter && changes.updated.some((entry) => entry.after.permissionId === id)) {
      return 'updated' as const
    }
    return inAfter ? ('linked' as const) : ('unlinked' as const)
  }

  const changeCountSummary = t('authorization.changes', {
    added: changes.added.length,
    removed: changes.removed.length,
    updated: changes.updated.length,
  })

  const renderDiffGroup = (
    items: Array<{ id: string; summary: string }>,
    tone: 'added' | 'updated' | 'removed',
  ) =>
    items.length > 0 && (
      <ul className="space-y-1.5">
        {items.map((item) => {
          const def = session.definitions.get(item.id)
          const name = def?.name ?? item.id
          return (
            <li
              key={`${tone}-${item.id}`}
              className="flex items-center justify-between gap-2 rounded-control border border-border-subtle px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      tone === 'added'
                        ? 'success'
                        : tone === 'removed'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {t(`authorization.${tone}`)}
                  </Badge>
                  <span className="truncate font-medium text-foreground">{name}</span>
                  {def?.code && (
                    <code className="truncate font-mono text-[11px] text-muted-foreground">
                      {def.code}
                    </code>
                  )}
                </div>
                {item.summary && <p className="mt-1 text-muted-foreground">{item.summary}</p>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={mutation.isPending}
                aria-label={t('authorization.undoNamed', { name })}
                onClick={() => undoRow(item.id)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </li>
          )
        })}
      </ul>
    )

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

      {!canReadCatalog && (
        <div
          role="status"
          className="rounded-control border border-border-subtle bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground"
        >
          {t('authorization.catalogDenied')}
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
                ? t('authorization.conflict')
                : saveError instanceof ApiError
                  ? saveError.message
                  : t('authorization.saveFailed')}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('authorization.saveFailedHint')}
            </p>
          </div>
          {conflict && (
            <Button variant="outline" size="sm" onClick={reloadBaseline}>
              {t('authorization.reload')}
            </Button>
          )}
        </div>
      )}

      {dirty && canEdit && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-brand-text/40 bg-primary/5 px-4 py-2.5"
        >
          <span className="text-sm font-medium text-foreground">{changeCountSummary}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={resetAllChanges}
            >
              <RotateCcw className="size-3.5" />
              {t('authorization.reset')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={disabled || invalid}
              onClick={() => setReviewing(true)}
            >
              <Save className="size-3.5" />
              {t('authorization.saveReview')}
            </Button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-panel border border-border-subtle bg-card shadow-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            {canReadCatalog && (
              <div
                role="group"
                aria-label={t('authorization.title')}
                className="inline-flex h-8 items-center gap-0.5 rounded-control border border-border-subtle bg-muted/60 p-0.5"
              >
                {(
                  [
                    ['all', t('authorization.filterAll')],
                    [
                      'assigned',
                      `${t('authorization.filterAssigned')} (${session.draft.current.size})`,
                    ],
                    ['unassigned', t('authorization.filterUnassigned')],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={statusFilter === value}
                    onClick={() => {
                      setStatusFilter(value)
                      setPage(0)
                    }}
                    className={`inline-flex h-full items-center rounded-md px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      statusFilter === value
                        ? 'bg-card font-medium text-foreground shadow-xs'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <form
              className="flex min-w-52 flex-1 items-center gap-1.5 sm:max-w-xs"
              onSubmit={(event) => {
                event.preventDefault()
                setKeyword(searchDraft.trim())
                setPage(0)
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  aria-label={t('authorization.search')}
                  placeholder={t('authorization.search')}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Button type="submit" size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                {t('authorization.query')}
              </Button>
              {(keyword || moduleFilter) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    setSearchDraft('')
                    setKeyword('')
                    setModuleFilter('')
                    setPage(0)
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </form>

            {moduleOptions.length > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant={moduleFilter === '' ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setModuleFilter('')
                    setPage(0)
                  }}
                >
                  {t('authorization.allModules', { defaultValue: '全部模块' })}
                </Button>
                {moduleOptions.map((mod) => (
                  <Button
                    key={mod}
                    type="button"
                    size="xs"
                    variant={moduleFilter === mod ? 'secondary' : 'ghost'}
                    onClick={() => {
                      setModuleFilter(mod)
                      setPage(0)
                    }}
                  >
                    {mod === '__core__' ? t('objectWorkspace.core') : mod}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">{t('authorization.grantColumn')}</TableHead>
                <TableHead className="min-w-60">{t('authorization.actionColumn')}</TableHead>
                <TableHead className="min-w-44">{t('authorization.scopeColumn')}</TableHead>
                <TableHead className="min-w-52">{t('authorization.ruleColumn')}</TableHead>
                <TableHead className="w-20 text-right">
                  {t('authorization.actionOpsColumn')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shouldFetchCatalog && candidateQuery.isPending && rowsData.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {t('authorization.readLoading')}
                  </TableCell>
                </TableRow>
              )}
              {(!shouldFetchCatalog || !candidateQuery.isPending) &&
                rowsData.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                      {statusFilter === 'assigned'
                        ? t('authorization.empty')
                        : t('authorization.emptyCandidates')}
                    </TableCell>
                  </TableRow>
                )}
              {rowsData.items.map((id) => {
                const def = session.definitions.get(id) ?? null
                const grant = session.draft.current.get(id)
                const linked = grant !== undefined
                const configurable = canConfigurePermission(def)
                const name = def?.name ?? t('authorization.definitionMissing')
                const code = def?.code ?? id
                const state = changeRowState(id)
                const scopes = def?.supportedScopeOverrides ?? []
                const rowWindowErr = grant ? grantWindowError(grant) : null
                const hasRowTimeErr =
                  rowWindowErr !== null ||
                  Boolean(timeErrors[id] && Object.values(timeErrors[id]).some(Boolean))
                const toggleLabel = t(
                  linked ? 'authorization.removeNamed' : 'authorization.addNamed',
                  { name },
                )

                return (
                  <TableRow
                    key={id}
                    data-grant-state={state}
                    data-highlight={highlightedId === id || undefined}
                    data-permission-code={def?.code}
                    className={
                      state === 'added' ||
                      state === 'removed' ||
                      state === 'updated' ||
                      highlightedId === id
                        ? 'bg-primary/5'
                        : undefined
                    }
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={linked}
                        disabled={!canEdit || disabled || (!linked && !configurable)}
                        aria-label={toggleLabel}
                        className="size-4 cursor-pointer rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                        onChange={() => toggleGrant(id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-foreground">{name}</span>
                          {state !== 'linked' && state !== 'unlinked' && (
                            <Badge
                              variant={
                                state === 'added'
                                  ? 'success'
                                  : state === 'removed'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              {t(`authorization.${state}`)}
                            </Badge>
                          )}
                          {def && def.lifecycle !== 'ACTIVE' && (
                            <Badge variant="outline">{t(`authorization.${def.lifecycle}`)}</Badge>
                          )}
                          {def && def.status !== 1 && (
                            <Badge variant="secondary">{t('authorization.inactive')}</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <code className="font-mono">{code}</code>
                          <span>·</span>
                          <span>{moduleLabel(def?.moduleKey, t('objectWorkspace.core'))}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {linked ? (
                        scopes.length > 1 ? (
                          <FieldSelect
                            aria-label={`${t('authorization.scope')}：${name}`}
                            value={grant.scopeOverride}
                            disabled={!canEdit || disabled || !configurable}
                            onValueChange={(value) =>
                              updateGrantFields(id, { scopeOverride: value as ScopeOverride })
                            }
                          >
                            {scopes.map((scope) => (
                              <FieldOption key={scope} value={scope}>
                                {t(`authorization.${scope}`)}
                              </FieldOption>
                            ))}
                          </FieldSelect>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t('authorization.notApplicableScope')}
                          </span>
                        )
                      ) : scopes.length > 1 ? (
                        <span className="text-xs text-muted-foreground">
                          {t('authorization.supportedScopesPrefix')}
                          {scopes.map((scope) => t(`authorization.${scope}`)).join(' / ')}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {linked ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <Switch
                              aria-label={`${t('authorization.enabled')}：${name}`}
                              checked={grant.enabled}
                              disabled={!canEdit || disabled || !configurable}
                              onCheckedChange={(enabled) => updateGrantFields(id, { enabled })}
                            />
                            <span className="text-xs text-muted-foreground">
                              {t(grant.enabled ? 'authorization.active' : 'authorization.paused')}
                            </span>
                          </div>
                          <Button
                            type="button"
                            size="xs"
                            variant={hasRowTimeErr ? 'destructive' : 'outline'}
                            disabled={!canEdit || disabled || !configurable}
                            aria-label={`${t('authorization.configureWindow')}：${name}`}
                            onClick={() => setRuleTargetId(id)}
                          >
                            <CalendarClock className="size-3.5" aria-hidden="true" />
                            <span className="tabular-nums">
                              {grant.validFrom || grant.validUntil
                                ? `${grant.validFrom ? new Date(grant.validFrom).toLocaleDateString() : '∞'} → ${grant.validUntil ? new Date(grant.validUntil).toLocaleDateString() : '∞'}`
                                : t('authorization.permanent', { defaultValue: '长期' })}
                            </span>
                          </Button>
                          {(() => {
                            const windowState = grantWindowState(grant, renderedAt)
                            return (
                              windowState !== 'withinWindow' &&
                              grant.enabled && (
                                <Badge variant="outline">{t(`authorization.${windowState}`)}</Badge>
                              )
                            )
                          })()}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(state === 'added' || state === 'removed' || state === 'updated') &&
                      canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={disabled}
                          aria-label={t('authorization.undoNamed', { name })}
                          onClick={() => undoRow(id)}
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

        {rowsData.total > GRANT_PAGE_SIZE && (
          <div className="border-t border-border-subtle px-4 py-3">
            <DynaPagination
              page={rowsData.page + 1}
              size={GRANT_PAGE_SIZE}
              total={rowsData.total}
              onPageChange={(next) => setPage(next - 1)}
            />
          </div>
        )}
      </section>

      <Dialog
        open={ruleTargetId !== null && ruleGrant !== undefined && canEdit}
        onOpenChange={(open) => {
          if (!open) setRuleTargetId(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {ruleTargetId && ruleGrant && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t('authorization.ruleSummary', {
                    name: ruleDef?.name ?? t('authorization.definitionMissing'),
                  })}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  {ruleDef?.code ?? ruleTargetId}
                </DialogDescription>
              </DialogHeader>
              <RoleGrantFields
                grant={ruleGrant}
                definition={ruleDef}
                zone={timeZone}
                onZoneChange={setTimeZone}
                disabled={disabled}
                errors={timeErrors[ruleTargetId]}
                onChange={(patch) => updateGrantFields(ruleTargetId, patch)}
                onTimeError={(field, error) =>
                  setTimeErrors((prev) => ({
                    ...prev,
                    [ruleTargetId]: {
                      ...prev[ruleTargetId],
                      [field]: error ?? undefined,
                    },
                  }))
                }
              />
              <DialogFooter>
                <Button type="button" onClick={() => setRuleTargetId(null)}>
                  {t('authorization.done')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={reviewing} onOpenChange={setReviewing}>
        <AlertDialogContent className="sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('authorization.reviewTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('authorization.reviewHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-96 space-y-4 overflow-y-auto py-2">
            {renderDiffGroup(
              changes.added.map((grant) => ({
                id: grant.permissionId,
                summary: `${t(`authorization.${grant.scopeOverride}`)} · ${t(grant.enabled ? 'authorization.active' : 'authorization.paused')}`,
              })),
              'added',
            )}
            {renderDiffGroup(
              changes.updated.map(({ before, after }) => ({
                id: after.permissionId,
                summary: `${t(`authorization.${before.scopeOverride}`)} → ${t(`authorization.${after.scopeOverride}`)}`,
              })),
              'updated',
            )}
            {renderDiffGroup(
              changes.removed.map((grant) => ({ id: grant.permissionId, summary: '' })),
              'removed',
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t('authorization.continueEditing')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || invalid || !dirty}
              onClick={(event) => {
                event?.preventDefault()
                assertAuthorizationCurrent()
                mutation.mutate(roleGrantSubmission(session.source, session.draft))
              }}
            >
              {mutation.isPending ? t('authorization.saving') : t('authorization.save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
