import { useLayoutEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, type QueryFilters } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Eye, Link2, Plus, RotateCcw, Save, Search, Unlink } from 'lucide-react'
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
import type { PageResult } from '@/lib/api/types'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { isAuthorizationCurrent, useAuthStore } from '@/stores/auth'

import { RoleGraphPagination } from './RolePermissionGraph'
import { RoleWorkspacePanels } from './RoleWorkspacePanels'
import { RoleMemberGraph, type RoleMemberGraphNode } from './RoleMemberGraph'
import {
  canReadRoleWorkspace,
  canManageRoleRelations,
  rolePermissionPage,
  type RolePermissionOpening,
} from './role-permission.model'
import {
  createRoleMemberCandidatesQuery,
  createRoleMemberDraftQuery,
  createRoleMembersQuery,
  ROLE_MEMBERS_PAGE_SIZE,
  type RoleGraphMember,
} from './role-permission.queries'
import {
  createRoleMemberDraft,
  resetRoleMemberDraft,
  roleMemberChanges,
  roleMemberLinkState,
  toggleRoleMember,
  undoRoleMember,
  unreadRoleMemberIds,
  validRoleMemberPage,
  type RoleMemberDraft,
} from './role-member-draft.model'
import { invalidateRoleGraphQueries, isRoleGraphConflict } from './role-graph.operations'
import { saveRoleMembers } from './role-member.operations'
import { useRoleGraphMutation } from './use-role-graph-mutation'

interface Props {
  opening: RolePermissionOpening
  presentation?: 'graph' | 'list'
  onClose: () => void
  onSaved: (selectedId?: string | null) => void
  initialSelectedId?: string | null
  initialCandidateKeyword?: string
  onResourceDenied: () => void
}

interface MemberResource {
  activate: () => void
  deactivate: () => void
  disposeIfInactive: () => boolean
  filter: QueryFilters
}
function useMemberResource(resource: MemberResource) {
  const client = useQueryClient()
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
}

export function RoleMemberEditor(props: Props) {
  const auth = useAuthStore()
  const { t } = useTranslation('system')
  // Candidate profile access is captured for this opening. Reopen to use a new grant.
  const [canBrowseUsers] = useState(() => auth.perms.includes('system:user:list'))
  const [revoked, setRevoked] = useState(false)
  const epoch = props.opening.principalEpoch
  const requiredPerms = useMemo(
    () => ['system:role:list', 'system:role:edit', ...(canBrowseUsers ? ['system:user:list'] : [])],
    [canBrowseUsers],
  )
  useLayoutEffect(
    () =>
      useAuthStore.subscribe((current) => {
        if (
          !canManageRoleRelations(current) ||
          current.sessionEpoch !== epoch ||
          !requiredPerms.every((perm) => current.perms.includes(perm))
        )
          setRevoked(true)
      }),
    [epoch, requiredPerms],
  )
  if (
    revoked ||
    !canReadRoleWorkspace(auth) ||
    !canManageRoleRelations(auth) ||
    !isAuthorizationCurrent(auth.authorizationEpoch) ||
    auth.sessionEpoch !== epoch ||
    !requiredPerms.every((perm) => auth.perms.includes(perm))
  ) {
    return (
      <div className="rounded-panel border bg-card p-5" role="alert">
        <p>{t('roleMemberEdit.denied')}</p>
        <Button className="mt-4" variant="outline" onClick={props.onResourceDenied}>
          {t('roleMemberEdit.back')}
        </Button>
      </div>
    )
  }
  return (
    <RoleMemberEditorContent
      {...props}
      key={`${props.opening.openId}:${auth.authorizationEpoch}`}
      canBrowseUsers={canBrowseUsers}
      requiredPerms={requiredPerms}
    />
  )
}

function RoleMemberEditorContent({
  opening,
  presentation = 'graph',
  initialSelectedId = null,
  initialCandidateKeyword = '',
  onClose,
  onSaved,
  onResourceDenied,
  canBrowseUsers,
  requiredPerms,
}: Props & { canBrowseUsers: boolean; requiredPerms: string[] }) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const [loadId, setLoadId] = useState(() => crypto.randomUUID())
  const [draft, setDraft] = useState<RoleMemberDraft | null>(null)
  const [profiles, setProfiles] = useState<ReadonlyMap<string, RoleGraphMember>>(() => new Map())
  const [profileSources, setProfileSources] = useState<{
    members?: PageResult<RoleGraphMember>
    candidates?: PageResult<RoleGraphMember>
  }>({})
  const [mode, setMode] = useState<'members' | 'candidates' | 'unread'>(() =>
    canBrowseUsers && initialCandidateKeyword ? 'candidates' : 'members',
  )
  const [memberPage, setMemberPage] = useState(1)
  const [candidatePage, setCandidatePage] = useState(1)
  const [otherPage, setOtherPage] = useState(0)
  const [searchDraft, setSearchDraft] = useState(initialCandidateKeyword)
  const [keyword, setKeyword] = useState(initialCandidateKeyword)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [inspectorOpen, setInspectorOpen] = useState(initialSelectedId !== null)
  const [reviewing, setReviewing] = useState(false)
  const [leaving, setLeaving] = useState<'close' | 'reload' | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const roleId = opening.role.id
  const epoch = opening.principalEpoch
  const ownedOpening = useMemo(
    () => ({ role: { id: roleId }, principalEpoch: epoch, openId: loadId }),
    [roleId, epoch, loadId],
  )
  const baselineResource = useMemo(() => createRoleMemberDraftQuery(ownedOpening), [ownedOpening])
  const membersResource = useMemo(
    () => createRoleMembersQuery(ownedOpening, memberPage),
    [ownedOpening, memberPage],
  )
  const candidateResource = useMemo(
    () => createRoleMemberCandidatesQuery(ownedOpening, { page: candidatePage, keyword }),
    [ownedOpening, candidatePage, keyword],
  )
  const baselineResult = useQuery(baselineResource.options)
  const membersResult = useQuery({ ...membersResource.options, enabled: mode === 'members' })
  const candidateResult = useQuery({
    ...candidateResource.options,
    enabled: mode === 'candidates' && canBrowseUsers,
  })
  useMemberResource(baselineResource)
  useMemberResource(membersResource)
  useMemberResource(candidateResource)
  const denied =
    accessDenied ||
    [baselineResult.error, membersResult.error, candidateResult.error].some(isResourceDenied)
  const denial = useResourceDenial({
    errors: [baselineResult.error, membersResult.error, candidateResult.error],
    clear: { queryKey: ['system', 'roles', roleId, 'users'] },
    reset: () => {
      setAccessDenied(true)
      setDraft(null)
      setProfiles(new Map())
      setProfileSources({})
      setSelectedId(null)
      setReviewing(false)
      onResourceDenied()
    },
  })
  if (!draft && baselineResult.isSuccess && !baselineResult.isFetching && !denied)
    setDraft(createRoleMemberDraft(baselineResult.data))
  const members = isResourceDenied(membersResult.error) ? undefined : membersResult.data
  const candidates = isResourceDenied(candidateResult.error) ? undefined : candidateResult.data
  if (
    members &&
    memberPage !== validRoleMemberPage(memberPage, members.total, ROLE_MEMBERS_PAGE_SIZE)
  ) {
    setMemberPage(validRoleMemberPage(memberPage, members.total, ROLE_MEMBERS_PAGE_SIZE))
    setSelectedId(null)
  }
  if (
    candidates &&
    candidatePage !== validRoleMemberPage(candidatePage, candidates.total, ROLE_MEMBERS_PAGE_SIZE)
  ) {
    setCandidatePage(validRoleMemberPage(candidatePage, candidates.total, ROLE_MEMBERS_PAGE_SIZE))
    setSelectedId(null)
  }
  const freshMembers =
    members && !membersResult.isFetching && !membersResult.isError ? members : undefined
  const freshCandidates =
    candidates && canBrowseUsers && !candidateResult.isFetching && !candidateResult.isError
      ? candidates
      : undefined
  if (
    draft &&
    !denied &&
    ((freshMembers && freshMembers !== profileSources.members) ||
      (freshCandidates && freshCandidates !== profileSources.candidates))
  ) {
    const next = new Map(profiles)
    freshMembers?.list.forEach((member) => next.set(member.id, member))
    freshCandidates?.list.forEach((member) => next.set(member.id, member))
    setProfiles(next)
    setProfileSources({
      members: freshMembers ?? profileSources.members,
      candidates: freshCandidates ?? profileSources.candidates,
    })
  }
  const mutation = useRoleGraphMutation({
    localKey: `${epoch}:${roleId}:${loadId}`,
    requiredPerms,
    requiredAllScopePerms: ['system:role:edit'],
    onDenied: denial,
    mutationFn: (variables: { baselineUserIds: string[]; userIds: string[] }, transport) =>
      saveRoleMembers(transport, { roleId, ...variables }),
    onSuccess: () => {
      toast.success(t('roleMemberEdit.saved'))
      onSaved(selectedId && draft?.selected.has(selectedId) ? selectedId : null)
      void invalidateRoleGraphQueries(client, roleId)
    },
    onError: (error) => setSaveError(error),
  })
  const changes = draft ? roleMemberChanges(draft) : { added: [], removed: [] }
  const dirty = changes.added.length > 0 || changes.removed.length > 0
  const conflict = isRoleGraphConflict(saveError)
  const activeResult =
    mode === 'members' ? membersResult : mode === 'candidates' ? candidateResult : undefined
  const disabled =
    mutation.isPending ||
    reviewing ||
    baselineResult.isFetching ||
    baselineResult.isError ||
    !!activeResult?.isFetching ||
    !!activeResult?.isError ||
    conflict
  const restart = () => {
    setLoadId(crypto.randomUUID())
    setDraft(null)
    setProfiles(new Map())
    setProfileSources({})
    setSelectedId(null)
    setMemberPage(1)
    setCandidatePage(1)
    setOtherPage(0)
    setReviewing(false)
    setSaveError(null)
    setAccessDenied(false)
    setLeaving(null)
  }
  const close = () => (dirty ? setLeaving('close') : onClose())
  const reload = () => (dirty ? setLeaving('reload') : restart())
  const toggle = (id: string) => {
    if (disabled) return
    setSelectedId(id)
    setInspectorOpen(true)
    setDraft((current) => (current ? toggleRoleMember(current, id) : current))
    setSaveError(null)
  }
  const undo = (id: string) => {
    if (mutation.isPending || conflict) return
    setDraft((current) => (current ? undoRoleMember(current, id) : current))
    setSaveError(null)
  }
  if (denied || (!draft && baselineResult.isError))
    return (
      <div className="space-y-4 rounded-panel border bg-card p-5" role="alert">
        <p>{t(denied ? 'roleMemberEdit.denied' : 'roleMemberEdit.loadFailed')}</p>
        {baselineResult.error instanceof ApiError && (
          <p className="text-sm text-muted-foreground">{baselineResult.error.message}</p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onResourceDenied}>
            {t('roleMemberEdit.back')}
          </Button>
          {!denied && <Button onClick={restart}>{t('roleMemberEdit.retry')}</Button>}
        </div>
      </div>
    )
  if (!draft)
    return (
      <div className="space-y-4 rounded-panel border bg-card p-5" role="status">
        <p>{t('roleMemberEdit.loading')}</p>
        <Skeleton className="h-80 rounded-panel" />
        <Button variant="outline" onClick={onClose}>
          {t('roleMemberEdit.back')}
        </Button>
      </div>
    )
  const unread = unreadRoleMemberIds(draft, profiles)
  const other = rolePermissionPage(unread, otherPage, ROLE_MEMBERS_PAGE_SIZE)
  const rows: RoleMemberGraphNode[] =
    mode === 'unread'
      ? other.items.map((id) => ({ id, state: roleMemberLinkState(draft, id) }))
      : ((mode === 'members' ? members?.list : candidates?.list)?.map((member) => ({
          id: member.id,
          member,
          state: roleMemberLinkState(draft, member.id),
        })) ?? [])
  const selected = selectedId ? profiles.get(selectedId) : undefined
  const page =
    mode === 'members' ? memberPage - 1 : mode === 'candidates' ? candidatePage - 1 : other.page
  const pageCount =
    mode === 'unread'
      ? other.pageCount
      : Math.max(
          1,
          Math.ceil(
            ((mode === 'members' ? members : candidates)?.total ?? 0) / ROLE_MEMBERS_PAGE_SIZE,
          ),
        )
  const changeList = (ids: string[], kind: 'added' | 'removed') => (
    <ul className="space-y-2">
      {ids.map((id) => {
        const profile = profiles.get(id)
        const name = profile?.nickname || profile?.username || id
        return (
          <li key={id} className="flex min-w-0 items-center gap-2 rounded-xl border p-3">
            {kind === 'added' ? (
              <Plus className="size-4 shrink-0 text-brand-text" />
            ) : (
              <Unlink className="size-4 shrink-0 text-destructive" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block break-words text-xs font-medium">{name}</span>
              <code className="mt-1 block break-all text-xs text-muted-foreground">{id}</code>
            </span>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={mutation.isPending || conflict}
              onClick={() => undo(id)}
              aria-label={t('roleMemberEdit.undoNamed', { name })}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </li>
        )
      })}
    </ul>
  )
  const inspector = (
    <InsightCard className="space-y-4 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="size-4" />
        {t('roleMemberEdit.details')}
      </h3>
      {selectedId ? (
        <>
          <p className="break-words text-sm font-medium">
            {selected?.nickname || selected?.username || t('roleMemberEdit.unreadProfile')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(`roleMemberEdit.state.${roleMemberLinkState(draft, selectedId)}`)}
          </p>
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="text-muted-foreground">{t('roleMemberEdit.id')}</dt>
              <dd className="mt-1 break-all font-mono">{selectedId}</dd>
            </div>
            {selected && (
              <>
                <div>
                  <dt className="text-muted-foreground">{t('roleMembers.username')}</dt>
                  <dd className="mt-1 break-words">{selected.username}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('roleMembers.status')}</dt>
                  <dd className="mt-1">
                    {t(
                      selected.status === 1
                        ? 'roleGraph.enabled'
                        : selected.status === 0
                          ? 'roleGraph.disabled'
                          : 'roleGraph.unknown',
                    )}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('roleMemberEdit.choose')}
        </p>
      )}
      <div className="border-t pt-4">
        <p className="text-xs font-medium">
          {t('roleMemberEdit.changesCount', {
            added: changes.added.length,
            removed: changes.removed.length,
          })}
        </p>
        <Button
          className="mt-3"
          size="sm"
          variant="ghost"
          disabled={!dirty || mutation.isPending || reviewing || conflict}
          onClick={() => {
            setDraft(resetRoleMemberDraft(draft))
            setSaveError(null)
          }}
        >
          <RotateCcw className="size-3.5" />
          {t('roleMemberEdit.reset')}
        </Button>
      </div>
    </InsightCard>
  )
  const review = (
    <InsightCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {t(reviewing ? 'roleMemberEdit.reviewTitle' : 'roleMemberEdit.changes')}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t('roleMemberEdit.changesCount', {
            added: changes.added.length,
            removed: changes.removed.length,
          })}
        </span>
      </div>
      {reviewing && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('roleMemberEdit.reviewHint')}
        </p>
      )}
      {dirty ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {changes.added.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs text-brand-text">{t('roleMemberEdit.added')}</h4>
              {changeList(changes.added, 'added')}
            </div>
          )}
          {changes.removed.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs text-destructive">{t('roleMemberEdit.removed')}</h4>
              {changeList(changes.removed, 'removed')}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('roleMemberEdit.noChanges')}</p>
      )}
      {dirty && draft.selected.size === 0 && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {t('roleMemberEdit.emptyWarning')}
        </p>
      )}
    </InsightCard>
  )
  const savebar = (
    <div className="role-menu-editor-savebar">
      <p className="text-xs text-muted-foreground">
        {t('roleMemberEdit.changesCount', {
          added: changes.added.length,
          removed: changes.removed.length,
        })}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {reviewing ? (
          <>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setReviewing(false)}
            >
              {t('roleMemberEdit.continueEditing')}
            </Button>
            <Button
              disabled={
                !dirty ||
                mutation.isPending ||
                conflict ||
                baselineResult.isFetching ||
                baselineResult.isError
              }
              onClick={() =>
                mutation.mutate({
                  baselineUserIds: [...draft.baseline],
                  userIds: [...draft.selected],
                })
              }
            >
              <Save className="size-4" />
              {t(mutation.isPending ? 'roleMemberEdit.saving' : 'roleMemberEdit.save')}
            </Button>
          </>
        ) : (
          <Button
            disabled={!dirty || disabled}
            onClick={() => {
              setReviewing(true)
              setInspectorOpen(true)
            }}
          >
            <Eye className="size-4" />
            {t('roleMemberEdit.review')}
          </Button>
        )}
      </div>
    </div>
  )
  return (
    <section
      className="role-member-workspace min-w-0 space-y-4"
      aria-label={t('roleMemberEdit.edit')}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t('roleMemberEdit.edit')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('roleMemberEdit.rules')}</p>
        </div>
        <Button variant="outline" disabled={mutation.isPending} onClick={close}>
          <ArrowLeft className="size-4" />
          {t('roleMemberEdit.back')}
        </Button>
      </header>
      {(saveError || baselineResult.isError || activeResult?.isError) && (
        <div className="space-y-3 rounded-xl border border-warning bg-card p-4" role="alert">
          <p className="text-sm">
            {conflict
              ? t('roleMemberEdit.conflict')
              : saveError instanceof ApiError
                ? saveError.message
                : activeResult?.error instanceof ApiError
                  ? activeResult.error.message
                  : t('roleMemberEdit.failed')}
          </p>
          <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={reload}>
            {t('roleMemberEdit.retry')}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-xs">
        <span>{t('roleMemberEdit.completeCount', { count: draft.baseline.size })}</span>
        <span>{t('roleMemberEdit.selectedCount', { count: draft.selected.size })}</span>
      </div>
      <RoleWorkspacePanels
        inspector={reviewing ? review : inspector}
        title={t(reviewing ? 'roleMemberEdit.reviewTitle' : 'roleMemberEdit.details')}
        context={t('roleManage.inspectorContext', {
          role: opening.role.roleName,
          object: t('roleMembers.title'),
        })}
        hasSelection={selectedId !== null || reviewing}
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        editing
        footer={savebar}
      >
        <InsightCard className="min-w-0 overflow-hidden p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('roleMemberEdit.edit')}>
            {(['members', 'candidates', 'unread'] as const).map((tab) => (
              <Button
                key={tab}
                size="sm"
                variant={mode === tab ? 'default' : 'outline'}
                aria-pressed={mode === tab}
                disabled={
                  reviewing || mutation.isPending || (tab === 'candidates' && !canBrowseUsers)
                }
                onClick={() => {
                  setMode(tab)
                  setSelectedId(null)
                }}
              >
                {t(
                  tab === 'members'
                    ? 'roleMemberEdit.visible'
                    : tab === 'candidates'
                      ? 'roleMemberEdit.candidates'
                      : 'roleMemberEdit.otherIds',
                )}
                {tab === 'unread' && ` (${unread.length})`}
              </Button>
            ))}
          </div>
          {!canBrowseUsers && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {t('roleMemberEdit.candidatePermission')}
            </p>
          )}
          {mode === 'candidates' && (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (disabled) return
                setKeyword(searchDraft.trim())
                setCandidatePage(1)
                setSelectedId(null)
              }}
            >
              <Input
                value={searchDraft}
                disabled={reviewing || mutation.isPending}
                onChange={(event) => setSearchDraft(event.target.value)}
                aria-label={t('roleMemberEdit.search')}
                placeholder={t('roleMemberEdit.searchPlaceholder')}
              />
              <Button
                type="submit"
                size="icon"
                variant="outline"
                disabled={reviewing || mutation.isPending}
                aria-label={t('roleMemberEdit.searchAction')}
              >
                <Search className="size-4" />
              </Button>
            </form>
          )}
          {mode === 'unread' && (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {t('roleMemberEdit.unknownHint')}
            </p>
          )}
          {activeResult?.isPending ? (
            <Skeleton className="mt-4 h-80 rounded-panel" />
          ) : (
            <>
              {presentation === 'list' ? (
                <ul className="my-4 divide-y divide-border">
                  {rows.map((row) => (
                    <li key={row.id} className="flex items-center gap-3 py-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          setSelectedId(row.id)
                          setInspectorOpen(true)
                        }}
                        aria-pressed={selectedId === row.id}
                      >
                        <span className="block text-sm font-medium">
                          {row.member?.nickname || row.member?.username || row.id}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {row.member?.username ?? t('roleMemberEdit.unknownHint')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t(
                            row.state === 'added'
                              ? 'roleManage.pendingAdd'
                              : row.state === 'removed'
                                ? 'roleManage.pendingRemove'
                                : row.state === 'linked'
                                  ? 'roleManage.linked'
                                  : 'roleManage.unlinked',
                          )}
                        </span>
                      </button>
                      <Button
                        size="sm"
                        variant={draft.selected.has(row.id) ? 'ghost' : 'outline'}
                        disabled={disabled}
                        onClick={() => toggle(row.id)}
                      >
                        {t(
                          draft.selected.has(row.id) ? 'authorization.remove' : 'authorization.add',
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <RoleMemberGraph
                  roleName={opening.role.roleName}
                  nodes={rows}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id)
                    setInspectorOpen(true)
                  }}
                  onToggle={toggle}
                  disabled={disabled}
                />
              )}
              {rows.length === 0 && (
                <p role="status" className="pb-6 text-center text-sm text-muted-foreground">
                  {t(
                    mode === 'candidates'
                      ? 'roleMemberEdit.noCandidates'
                      : mode === 'unread'
                        ? 'roleMemberEdit.noOtherIds'
                        : 'roleMemberEdit.noRows',
                  )}
                </p>
              )}
              <fieldset disabled={reviewing || mutation.isPending}>
                <RoleGraphPagination
                  page={page}
                  pages={pageCount}
                  onPage={(next) => {
                    if (reviewing || mutation.isPending) return
                    setSelectedId(null)
                    if (mode === 'members') setMemberPage(next + 1)
                    else if (mode === 'candidates') setCandidatePage(next + 1)
                    else setOtherPage(next)
                  }}
                />
              </fieldset>
            </>
          )}
        </InsightCard>
      </RoleWorkspacePanels>
      {savebar}
      <AlertDialog
        open={leaving !== null}
        onOpenChange={(open) => {
          if (!open) setLeaving(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('roleMemberEdit.leaveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('roleMemberEdit.leaveHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('roleMemberEdit.keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => (leaving === 'reload' ? restart() : onClose())}
            >
              {t(leaving === 'reload' ? 'roleMemberEdit.discardReload' : 'roleMemberEdit.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
