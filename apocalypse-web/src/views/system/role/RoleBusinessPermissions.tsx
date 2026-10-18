/** Complete role grant workflow shared by list and object/relationship presentations. */
import { useLayoutEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Unlink,
} from 'lucide-react'
import { toast } from 'sonner'

import { InsightCard } from '@/components/insights/InsightCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import { ApiError } from '@/lib/api/client'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { assertAuthorizationCurrent, isAuthorizationCurrent, useAuthStore } from '@/stores/auth'

import { canConfigurePermission, type PermissionDefinition } from '../permission/permission.types'
import { RoleGraphPagination } from './RolePermissionGraph'
import { RoleGrantGraph, type GrantNode } from './RoleGrantGraph'
import { RoleGrantFields } from './RoleGrantFields'
import {
  canManageRoleRelations,
  canReadRoleWorkspace,
  rolePermissionPage,
  type RolePermissionOpening,
} from './role-permission.model'
import {
  createGrantCandidatesQuery,
  createRoleGrantQuery,
  GRANT_PAGE_SIZE,
} from './role-grant.queries'
import {
  addRoleGrant,
  createRoleGrantDraft,
  grantWindowError,
  grantWindowState,
  removeRoleGrant,
  resetRoleGrantDraft,
  roleGrantChanges,
  roleGrantSubmission,
  sameRoleGrant,
  undoRoleGrant,
  updateRoleGrant,
  type RoleGrant,
  type RoleGrantDraft,
  type RoleGrantsBaseline,
} from './role-grant.model'
import { invalidateRoleGraphQueries, isRoleGraphConflict } from './role-graph.operations'
import { saveRoleGrants } from './role-grant.operations'
import { useRoleGraphMutation } from './use-role-graph-mutation'

interface Props {
  opening: RolePermissionOpening
  presentation?: 'graph' | 'list'
  onEditingChange: (editing: boolean) => void
  onClose?: () => void
}
interface GrantSession {
  source: RoleGrantsBaseline
  draft: RoleGrantDraft
  definitions: ReadonlyMap<string, PermissionDefinition | null>
}

export function RoleBusinessPermissions(props: Props) {
  const auth = useAuthStore()
  if (
    !canReadRoleWorkspace(auth) ||
    auth.sessionEpoch !== props.opening.principalEpoch ||
    !isAuthorizationCurrent(auth.authorizationEpoch)
  )
    return null
  return (
    <RoleBusinessPermissionContent
      key={`${props.opening.openId}:${auth.authorizationEpoch}`}
      {...props}
    />
  )
}

function GrantDescription({ grant }: { grant: RoleGrant }) {
  const { t, i18n } = useTranslation('system')
  const format = (value: string | null, empty: 'noStart' | 'noEnd') =>
    value
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
          dateStyle: 'medium',
          timeStyle: 'long',
        }).format(new Date(value))
      : t(`authorization.${empty}`)
  return (
    <dl className="space-y-1 text-xs text-muted-foreground">
      <div>
        {t(grant.enabled ? 'authorization.active' : 'authorization.paused')} ·{' '}
        {t(`authorization.${grant.scopeOverride}`)}
      </div>
      <div>
        {format(grant.validFrom, 'noStart')} → {format(grant.validUntil, 'noEnd')}
      </div>
    </dl>
  )
}

function RoleBusinessPermissionContent({
  opening,
  presentation = 'graph',
  onEditingChange,
  onClose,
}: Props) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const auth = useAuthStore()
  const epoch = auth.authorizationEpoch
  const roleId = opening.role.id
  const principalEpoch = opening.principalEpoch
  const [describedAt] = useState(() => Date.now())
  const [lastCandidateData, setLastCandidateData] = useState<unknown>(null)
  const [loadId, setLoadId] = useState(() => opening.openId)
  const [session, setSession] = useState<GrantSession | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'assigned' | 'candidates'>('assigned')
  const [searchDraft, setSearchDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [reviewing, setReviewing] = useState(false)
  const [leaving, setLeaving] = useState<'close' | 'reload' | null>(null)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [timeErrors, setTimeErrors] = useState<
    Record<string, Partial<Record<'validFrom' | 'validUntil', string>>>
  >({})
  const resource = useMemo(
    () =>
      createRoleGrantQuery({ role: { id: roleId }, principalEpoch, openId: `${loadId}:${epoch}` }),
    [roleId, principalEpoch, loadId, epoch],
  )
  const candidateResource = useMemo(
    () =>
      createGrantCandidatesQuery(
        { role: { id: roleId }, principalEpoch, openId: `${loadId}:${epoch}` },
        { page: page + 1, keyword },
      ),
    [roleId, principalEpoch, loadId, epoch, page, keyword],
  )
  const result = useQuery(resource.options)
  const canReadCatalog = auth.perms.includes('system:permission:list')
  const candidates = useQuery({
    ...candidateResource.options,
    enabled: session !== null && mode === 'candidates' && canReadCatalog && !accessDenied,
  })
  useLayoutEffect(() => {
    resource.activate()
    return () => {
      resource.deactivate()
      queueMicrotask(() => {
        if (!resource.disposeIfInactive()) return
        void client.cancelQueries(resource.filter, { revert: false })
        client.removeQueries(resource.filter)
      })
    }
  }, [client, resource])
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
  }, [client, candidateResource])
  const editing = session !== null
  useLayoutEffect(() => {
    onEditingChange(editing && !accessDenied)
    return () => onEditingChange(false)
  }, [editing, accessDenied, onEditingChange])
  const denial = useResourceDenial({
    errors: [result.error, candidates.error],
    clear: { queryKey: ['system', 'roles', roleId] },
    reset: () => {
      setAccessDenied(true)
      setSession(null)
      setSelectedId(null)
      setReviewing(false)
      setTimeErrors({})
    },
  })
  useLayoutEffect(
    () =>
      useAuthStore.subscribe((current) => {
        if (
          !isAuthorizationCurrent(epoch) ||
          !canReadRoleWorkspace(current) ||
          (editing && !canManageRoleRelations(current))
        ) {
          setAccessDenied(true)
          setSession(null)
          setSelectedId(null)
          setReviewing(false)
          setTimeErrors({})
        }
      }),
    [epoch, editing],
  )
  if (
    session &&
    candidates.data &&
    candidates.data !== lastCandidateData &&
    !candidates.isError &&
    !candidates.isFetching
  ) {
    setLastCandidateData(candidates.data)
    const definitions = new Map(session.definitions)
    candidates.data.list.forEach((definition) => definitions.set(definition.id, definition))
    setSession({ ...session, definitions })
    const lastPage = Math.max(0, Math.ceil(candidates.data.total / GRANT_PAGE_SIZE) - 1)
    if (page > lastPage) setPage(lastPage)
  }

  const mutation = useRoleGraphMutation({
    localKey: `${principalEpoch}:${epoch}:${roleId}:${loadId}`,
    requiredPerms: ['system:role:list', 'system:role:edit'],
    requiredAllScopePerms: ['system:role:edit'],
    onDenied: denial,
    mutationFn: (submission: ReturnType<typeof roleGrantSubmission>, transport) =>
      saveRoleGrants(transport, roleId, submission),
    onSuccess: () => {
      toast.success(t('authorization.saved'))
      setSession(null)
      setSelectedId(null)
      setMode('assigned')
      setPage(0)
      setReviewing(false)
      setLoadId(crypto.randomUUID())
      void invalidateRoleGraphQueries(client, roleId)
    },
    onError: setSaveError,
  })
  const current = () => {
    try {
      assertAuthorizationCurrent(epoch)
      return true
    } catch {
      return false
    }
  }
  const denied =
    accessDenied || isResourceDenied(result.error) || isResourceDenied(candidates.error)
  const changes = session
    ? roleGrantChanges(session.draft)
    : { added: [], removed: [], updated: [] }
  const dirty = changes.added.length + changes.removed.length + changes.updated.length > 0
  const conflict = isRoleGraphConflict(saveError)
  const restart = () => {
    if (!current()) return
    setSession(null)
    setSelectedId(null)
    setMode('assigned')
    setPage(0)
    setReviewing(false)
    setAccessDenied(false)
    setSaveError(null)
    setTimeErrors({})
    setLeaving(null)
    setLoadId(crypto.randomUUID())
  }
  const exit = () => {
    setSession(null)
    setSelectedId(null)
    setMode('assigned')
    setReviewing(false)
    setTimeErrors({})
    setLeaving(null)
  }
  const requestClose = () => {
    if (dirty) setLeaving('close')
    else if (session) exit()
    else onClose?.()
  }
  const begin = () => {
    if (
      !current() ||
      !canManageRoleRelations(useAuthStore.getState()) ||
      !result.data ||
      result.isFetching ||
      result.isError
    )
      return
    setLastCandidateData(null)
    setSession({
      source: result.data,
      draft: createRoleGrantDraft(result.data.grants),
      definitions: new Map(
        result.data.grants.map((grant) => [grant.permissionId, grant.definition]),
      ),
    })
    setSaveError(null)
    setTimeErrors({})
    setSelectedId(null)
    setPage(0)
  }

  if (denied || (!result.data && result.isError))
    return (
      <div className="space-y-4 rounded-panel border bg-card p-5" role="alert">
        <p>{t(denied ? 'authorization.denied' : 'authorization.readFailed')}</p>
        {result.error instanceof ApiError && (
          <p className="text-sm text-muted-foreground">{result.error.message}</p>
        )}
        <div className="flex gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              {t('authorization.back')}
            </Button>
          )}
          <Button variant="outline" onClick={restart}>
            {t('authorization.retry')}
          </Button>
        </div>
      </div>
    )
  if (!result.data)
    return (
      <div className="space-y-4 p-5" role="status">
        <p>{t('authorization.readLoading')}</p>
        <Skeleton className="h-80 rounded-panel" />
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            {t('authorization.back')}
          </Button>
        )}
      </div>
    )

  const source = session?.source ?? result.data
  const draft = session?.draft ?? createRoleGrantDraft(source.grants)
  const definitionFor = (id: string) =>
    session?.definitions.get(id) ??
    candidates.data?.list.find((definition) => definition.id === id) ??
    source.grants.find((grant) => grant.permissionId === id)?.definition ??
    null
  const stateFor = (id: string): GrantNode['state'] => {
    const before = draft.baseline.get(id),
      after = draft.current.get(id)
    return before
      ? after
        ? sameRoleGrant(before, after)
          ? 'linked'
          : 'updated'
        : 'removed'
      : after
        ? 'added'
        : 'unlinked'
  }
  const assignedIds = [...new Set([...draft.baseline.keys(), ...draft.current.keys()])].filter(
    (id) => {
      const definition = definitionFor(id)
      return (
        !keyword ||
        [id, definition?.name ?? '', definition?.code ?? '', definition?.resource ?? ''].some(
          (value) => value.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()),
        )
      )
    },
  )
  const assignedPage = rolePermissionPage(assignedIds, page, GRANT_PAGE_SIZE)
  const candidateRows = canReadCatalog ? (candidates.data?.list ?? []) : []
  const ids =
    mode === 'candidates' && session
      ? candidateRows.map((definition) => definition.id)
      : assignedPage.items
  const pages =
    mode === 'candidates' && session
      ? Math.max(1, Math.ceil((candidates.data?.total ?? 0) / GRANT_PAGE_SIZE))
      : assignedPage.pageCount
  const nodes: GrantNode[] = ids.map((id) => ({
    id,
    definition: definitionFor(id),
    state: stateFor(id),
    configurable: canConfigurePermission(definitionFor(id)),
  }))
  const selectedDefinition = selectedId ? definitionFor(selectedId) : null
  const selectedGrant = selectedId ? draft.current.get(selectedId) : undefined
  const disabled =
    mutation.isPending ||
    reviewing ||
    conflict ||
    result.isFetching ||
    result.isError ||
    (mode === 'candidates' && (candidates.isFetching || candidates.isError))
  const change = (update: (draft: RoleGrantDraft) => RoleGrantDraft) => {
    if (!current() || disabled || !canManageRoleRelations(useAuthStore.getState())) return
    setSession((previous) => (previous ? { ...previous, draft: update(previous.draft) } : previous))
    setSaveError(null)
  }
  const toggle = (id: string) => {
    setSelectedId(id)
    change((previous) =>
      previous.current.has(id)
        ? removeRoleGrant(previous, id)
        : canConfigurePermission(definitionFor(id))
          ? addRoleGrant(previous, id)
          : previous,
    )
    setTimeErrors((previous) => {
      const next = { ...previous }
      delete next[id]
      return next
    })
  }
  const undo = (id: string) => {
    if (!current() || mutation.isPending || conflict) return
    setSession((previous) =>
      previous ? { ...previous, draft: undoRoleGrant(previous.draft, id) } : previous,
    )
    setTimeErrors((previous) => {
      const next = { ...previous }
      delete next[id]
      return next
    })
  }
  const invalid =
    [...draft.current.values()].some((grant) => grantWindowError(grant) !== null) ||
    Object.entries(timeErrors).some(
      ([id, errors]) => draft.current.has(id) && Object.values(errors).some(Boolean),
    )
  const changeCount = () =>
    t('authorization.changes', {
      added: changes.added.length,
      removed: changes.removed.length,
      updated: changes.updated.length,
    })
  const changeRow = (
    id: string,
    kind: 'added' | 'removed' | 'updated',
    before: RoleGrant | undefined,
    after: RoleGrant | undefined,
  ) => (
    <li key={id} className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{definitionFor(id)?.name ?? id}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t(`authorization.${kind}`)}</p>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={mutation.isPending || conflict}
          onClick={() => undo(id)}
          aria-label={t('authorization.undo')}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
      {before && (
        <div>
          <p className="mb-1 text-xs font-medium">{t('authorization.before')}</p>
          <GrantDescription grant={before} />
        </div>
      )}
      {after && (
        <div>
          <p className="mb-1 text-xs font-medium">{t('authorization.after')}</p>
          <GrantDescription grant={after} />
        </div>
      )}
    </li>
  )
  return (
    <section className="min-w-0 space-y-4" aria-label={t('authorization.title')}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('authorization.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {opening.role.roleName} · {t('authorization.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session || onClose ? (
            <Button variant="outline" disabled={mutation.isPending} onClick={requestClose}>
              <ArrowLeft className="size-4" />
              {t(session ? 'authorization.close' : 'authorization.back')}
            </Button>
          ) : null}
          {!session && canManageRoleRelations(auth) && (
            <Button
              variant="outline"
              disabled={result.isFetching || result.isError}
              onClick={begin}
            >
              <Pencil className="size-4" />
              {t('authorization.edit')}
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => (dirty ? setLeaving('reload') : restart())}
            aria-label={t('authorization.retry')}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </header>
      {(saveError || result.isError || (mode === 'candidates' && candidates.isError)) && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-warning bg-card p-4 text-sm"
        >
          <p>
            {conflict
              ? t('authorization.conflict')
              : saveError instanceof ApiError
                ? saveError.message
                : candidates.error instanceof ApiError
                  ? candidates.error.message
                  : t('authorization.readFailed')}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => (dirty ? setLeaving('reload') : restart())}
          >
            {t('authorization.retry')}
          </Button>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('authorization.savedConfig')}
      </p>
      <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <InsightCard className="min-w-0 overflow-hidden">
          <div className="space-y-4 border-b border-border-subtle p-4">
            {session && (
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={t('authorization.title')}
              >
                {(['assigned', 'candidates'] as const).map((tab) => (
                  <Button
                    key={tab}
                    size="sm"
                    variant={mode === tab ? 'default' : 'outline'}
                    disabled={
                      reviewing || mutation.isPending || (tab === 'candidates' && !canReadCatalog)
                    }
                    aria-pressed={mode === tab}
                    onClick={() => {
                      setMode(tab)
                      setPage(0)
                      setSelectedId(null)
                    }}
                  >
                    {t(`authorization.${tab}`)}
                  </Button>
                ))}
              </div>
            )}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (!reviewing && !mutation.isPending) {
                  setKeyword(searchDraft.trim())
                  setPage(0)
                  setSelectedId(null)
                }
              }}
            >
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                aria-label={t('authorization.search')}
                placeholder={t('authorization.search')}
                disabled={reviewing || mutation.isPending}
              />
              <Button
                type="submit"
                size="icon"
                variant="outline"
                disabled={reviewing || mutation.isPending}
                aria-label={t('authorization.query')}
              >
                <Search className="size-4" />
              </Button>
            </form>
            {!canReadCatalog && session && (
              <p className="text-xs text-muted-foreground">{t('authorization.catalogDenied')}</p>
            )}
          </div>
          {mode === 'candidates' && candidates.isPending ? (
            <Skeleton className="m-4 h-80 rounded-panel" />
          ) : nodes.length ? (
            presentation === 'graph' ? (
              <RoleGrantGraph
                roleName={opening.role.roleName}
                nodes={nodes}
                selectedId={selectedId}
                editing={session !== null}
                disabled={disabled}
                onSelect={setSelectedId}
                onToggle={toggle}
              />
            ) : (
              <ul className="space-y-3 p-4">
                {nodes.map((node) => {
                  const linked = draft.current.has(node.id)
                  return (
                    <li key={node.id} className="rounded-xl border p-3">
                      <div className="flex items-start gap-3">
                        <KeyRound className="mt-1 size-5 shrink-0 text-brand-text" />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-pressed={selectedId === node.id}
                          onClick={() => setSelectedId(node.id)}
                        >
                          <span className="block break-words text-sm font-medium">
                            {node.definition?.name ?? t('authorization.definitionMissing')}
                          </span>
                          <code className="mt-1 block break-all text-xs text-muted-foreground">
                            {node.definition?.code ?? node.id}
                          </code>
                        </button>
                        {session && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={disabled || (!linked && !node.configurable)}
                            onClick={() => toggle(node.id)}
                            aria-label={t(
                              linked ? 'authorization.removeNamed' : 'authorization.addNamed',
                              { name: node.definition?.name ?? node.id },
                            )}
                          >
                            {linked ? <Unlink className="size-4" /> : <Plus className="size-4" />}
                            {t(linked ? 'authorization.remove' : 'authorization.add')}
                          </Button>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t(`authorization.${node.state}`)}
                      </p>
                      {draft.current.get(node.id) && (
                        <div className="mt-2">
                          <GrantDescription grant={draft.current.get(node.id)!} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          ) : (
            <p className="p-12 text-center text-sm text-muted-foreground" role="status">
              {t(mode === 'candidates' ? 'authorization.emptyCandidates' : 'authorization.empty')}
            </p>
          )}
          <div className="space-y-3 border-t border-border-subtle p-4">
            <RoleGraphPagination
              page={mode === 'assigned' ? assignedPage.page : Math.min(page, pages - 1)}
              pages={pages}
              onPage={(next) => {
                if (!reviewing && !mutation.isPending) {
                  setPage(next)
                  setSelectedId(null)
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {session
                ? t('authorization.selectedCount', { count: draft.current.size })
                : `${t('authorization.configuredCount')} · ${source.grants.length}`}
            </p>
            {mode === 'candidates' && (
              <p className="text-xs text-muted-foreground">{t('authorization.candidateHint')}</p>
            )}
          </div>
        </InsightCard>
        <InsightCard className="min-w-0 space-y-4 p-5">
          <h3 className="text-sm font-semibold">{t('authorization.definition')}</h3>
          {selectedId ? (
            <>
              <p className="break-words text-sm font-medium">
                {selectedDefinition?.name ?? t('authorization.definitionMissing')}
              </p>
              <code className="block break-all text-xs text-muted-foreground">
                {selectedDefinition?.code ?? selectedId}
              </code>
              {selectedDefinition && (
                <dl className="space-y-2 text-xs">
                  {[
                    ['moduleKey', selectedDefinition.moduleKey ?? 'system'],
                    ['resource', selectedDefinition.resource],
                    ['action', selectedDefinition.action],
                    ['lifecycle', t(`authorization.${selectedDefinition.lifecycle}`)],
                    [
                      'status',
                      t(
                        selectedDefinition.status === 1
                          ? 'authorization.active'
                          : 'authorization.inactive',
                      ),
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{t(`authorization.${label}`)}</dt>
                      <dd className="break-all text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {!canConfigurePermission(selectedDefinition) && session && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('authorization.legacyHint')}
                </p>
              )}
              {selectedGrant && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t(`authorization.${grantWindowState(selectedGrant, describedAt)}`)}
                  </p>
                  {session ? (
                    <RoleGrantFields
                      grant={selectedGrant}
                      definition={selectedDefinition}
                      disabled={disabled || !canConfigurePermission(selectedDefinition)}
                      errors={timeErrors[selectedId]}
                      onChange={(values) =>
                        change((previous) => updateRoleGrant(previous, selectedId, values))
                      }
                      onTimeError={(field, error) =>
                        setTimeErrors((previous) => ({
                          ...previous,
                          [selectedId]: { ...previous[selectedId], [field]: error ?? undefined },
                        }))
                      }
                    />
                  ) : (
                    <GrantDescription grant={selectedGrant} />
                  )}
                </>
              )}
            </>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('authorization.selectedHint')}
            </p>
          )}
          <div className="border-t pt-4 text-xs text-muted-foreground">
            <p>
              {t('authorization.roleScope')} ·{' '}
              {opening.role.dataScope ? t(`authorization.${opening.role.dataScope}`) : '—'}
            </p>
            <p className="mt-3 leading-relaxed">{t('authorization.clockHint')}</p>
          </div>
        </InsightCard>
      </div>
      {session && (
        <InsightCard className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                {t(reviewing ? 'authorization.reviewTitle' : 'authorization.savedConfig')}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">{changeCount()}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!dirty || reviewing || mutation.isPending || conflict}
              onClick={() => {
                change(resetRoleGrantDraft)
                setTimeErrors({})
              }}
            >
              <RotateCcw className="size-4" />
              {t('authorization.reset')}
            </Button>
          </div>
          {reviewing && (
            <p className="text-xs text-muted-foreground">{t('authorization.reviewHint')}</p>
          )}
          {dirty ? (
            <ul className="grid gap-3 xl:grid-cols-2">
              {changes.added.map((grant) =>
                changeRow(grant.permissionId, 'added', undefined, grant),
              )}
              {changes.removed.map((grant) =>
                changeRow(grant.permissionId, 'removed', grant, undefined),
              )}
              {changes.updated.map(({ before, after }) =>
                changeRow(after.permissionId, 'updated', before, after),
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('authorization.noChanges')}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            {reviewing ? (
              <>
                <Button
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => setReviewing(false)}
                >
                  {t('authorization.continueEditing')}
                </Button>
                <Button
                  disabled={
                    !dirty ||
                    invalid ||
                    mutation.isPending ||
                    conflict ||
                    result.isError ||
                    result.isFetching
                  }
                  onClick={() => {
                    if (current() && canManageRoleRelations(useAuthStore.getState()))
                      mutation.mutate(roleGrantSubmission(session.source, session.draft))
                  }}
                >
                  <Save className="size-4" />
                  {t(mutation.isPending ? 'authorization.saving' : 'authorization.save')}
                </Button>
              </>
            ) : (
              <Button
                disabled={!dirty || invalid || disabled}
                onClick={() => {
                  if (current()) setReviewing(true)
                }}
              >
                <Eye className="size-4" />
                {t('authorization.review')}
              </Button>
            )}
          </div>
        </InsightCard>
      )}
      <AlertDialog
        open={leaving !== null}
        onOpenChange={(open) => {
          if (!open) setLeaving(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('authorization.leaveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('authorization.leaveHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('authorization.keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => (leaving === 'reload' ? restart() : exit())}
            >
              {t(leaving === 'reload' ? 'authorization.reload' : 'authorization.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
