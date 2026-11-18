/** 角色成员管理页签：可见成员表格 + 安全添加成员搜索弹窗 + 跨部门不可见成员完整基线保护。 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RotateCcw, Save, Search, Unlink, UserPlus } from 'lucide-react'
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
import { isAuthorizationCurrent, useAuthStore } from '@/stores/auth'

import { invalidateRoleGraphQueries, isRoleGraphConflict } from './role-graph.operations'
import {
  createRoleMemberDraft,
  resetRoleMemberDraft,
  roleMemberChanges,
  roleMemberLinkState,
  toggleRoleMember,
  undoRoleMember,
  unreadRoleMemberIds,
  type RoleMemberDraft,
} from './role-member-draft.model'
import { saveRoleMembers } from './role-member.operations'
import {
  canManageRoleRelations,
  canReadRoleWorkspace,
  type RolePermissionOpening,
} from './role-permission.model'
import {
  createRoleMemberCandidatesQuery,
  createRoleMemberDraftQuery,
  createRoleMembersQuery,
  ROLE_MEMBERS_PAGE_SIZE,
  type RoleGraphMember,
} from './role-permission.queries'
import { useRoleGraphMutation } from './use-role-graph-mutation'

interface PendingMember {
  userId: string
  keyword: string
}

interface RoleMembersTabProps {
  opening: RolePermissionOpening
  pendingMember?: PendingMember | null
  onDirtyChange?: (dirty: boolean) => void
  onCountChange?: (count: number) => void
}

function sameProfiles(
  map: ReadonlyMap<string, RoleGraphMember>,
  list: readonly RoleGraphMember[],
): boolean {
  return list.every((member) => map.get(member.id) === member)
}

function mergeProfiles(
  map: ReadonlyMap<string, RoleGraphMember>,
  list: readonly RoleGraphMember[],
): Map<string, RoleGraphMember> {
  const next = new Map(map)
  for (const member of list) {
    next.set(member.id, member)
  }
  return next
}

export function RoleMembersTab(props: RoleMembersTabProps) {
  const auth = useAuthStore()
  if (
    !canReadRoleWorkspace(auth) ||
    auth.sessionEpoch !== props.opening.principalEpoch ||
    !isAuthorizationCurrent(auth.authorizationEpoch)
  ) {
    return null
  }
  return (
    <RoleMembersTabContent key={`${props.opening.openId}:${auth.authorizationEpoch}`} {...props} />
  )
}

function RoleMembersTabContent({
  opening,
  pendingMember = null,
  onDirtyChange,
  onCountChange,
}: RoleMembersTabProps) {
  const { t } = useTranslation('system')
  const { t: commonT } = useTranslation()
  const client = useQueryClient()
  const auth = useAuthStore()
  const roleId = opening.role.id
  const epoch = opening.principalEpoch
  const [canBrowseUsers] = useState(() => auth.perms.includes('system:user:list'))
  const requiredEditPerms = useMemo(
    () => ['system:role:list', 'system:role:edit', ...(canBrowseUsers ? ['system:user:list'] : [])],
    [canBrowseUsers],
  )

  const [loadId, setLoadId] = useState(() => crypto.randomUUID())
  const [draft, setDraft] = useState<RoleMemberDraft | null>(null)
  const [loadedKey, setLoadedKey] = useState('')
  const [profiles, setProfiles] = useState<Map<string, RoleGraphMember>>(() => new Map())
  const [memberPage, setMemberPage] = useState(1)
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidateDraft, setCandidateDraft] = useState(() => pendingMember?.keyword ?? '')
  const [candidateKeyword, setCandidateKeyword] = useState(() => pendingMember?.keyword ?? '')
  const [addOpen, setAddOpen] = useState(() =>
    Boolean(pendingMember && canManageRoleRelations(auth) && canBrowseUsers),
  )
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
      createRoleMemberDraftQuery({
        openId: `${opening.openId}:${loadId}`,
        principalEpoch: epoch,
        role: { id: roleId },
      }),
    [opening.openId, loadId, epoch, roleId],
  )
  const membersResource = useMemo(
    () =>
      createRoleMembersQuery(
        {
          openId: `${opening.openId}:${loadId}`,
          principalEpoch: epoch,
          role: { id: roleId },
        },
        memberPage,
      ),
    [opening.openId, loadId, epoch, roleId, memberPage],
  )
  const candidatesResource = useMemo(
    () =>
      createRoleMemberCandidatesQuery(
        {
          openId: `${opening.openId}:${loadId}`,
          principalEpoch: epoch,
          role: { id: roleId },
        },
        { page: candidatePage, keyword: candidateKeyword },
      ),
    [opening.openId, loadId, epoch, roleId, candidatePage, candidateKeyword],
  )

  const baselineQuery = useQuery({
    ...baselineResource.options,
    enabled: canEdit,
  })
  const membersQuery = useQuery(membersResource.options)
  const candidateQuery = useQuery({
    ...candidatesResource.options,
    enabled: canEdit && canBrowseUsers && addOpen,
  })

  useLayoutEffect(() => {
    baselineResource.activate()
    membersResource.activate()
    candidatesResource.activate()
    return () => {
      baselineResource.deactivate()
      membersResource.deactivate()
      candidatesResource.deactivate()
      queueMicrotask(() => {
        for (const res of [baselineResource, membersResource, candidatesResource]) {
          if (!res.disposeIfInactive()) continue
          void client.cancelQueries(res.filter, { revert: false })
          client.removeQueries(res.filter)
        }
      })
    }
  }, [baselineResource, membersResource, candidatesResource, client])

  const loadKey = `${roleId}:${loadId}`
  if (canEdit && baselineQuery.data && !baselineQuery.isFetching && loadedKey !== loadKey) {
    setLoadedKey(loadKey)
    setDraft(createRoleMemberDraft(baselineQuery.data))
  }

  if (membersQuery.data?.list && !sameProfiles(profiles, membersQuery.data.list)) {
    setProfiles((prev) => mergeProfiles(prev, membersQuery.data!.list))
  }
  if (candidateQuery.data?.list && !sameProfiles(profiles, candidateQuery.data.list)) {
    setProfiles((prev) => mergeProfiles(prev, candidateQuery.data!.list))
  }

  const changes = useMemo(
    () => (draft ? roleMemberChanges(draft) : { added: [], removed: [] }),
    [draft],
  )
  const dirty = changes.added.length > 0 || changes.removed.length > 0

  useLayoutEffect(() => {
    onDirtyChange?.(dirty && canEdit)
  }, [dirty, canEdit, onDirtyChange])

  useLayoutEffect(() => {
    if (membersQuery.data) onCountChange?.(membersQuery.data.total)
  }, [membersQuery.data, onCountChange])

  useLayoutEffect(
    () =>
      useAuthStore.subscribe((current) => {
        if (
          !canReadRoleWorkspace(current) ||
          current.sessionEpoch !== epoch ||
          !isAuthorizationCurrent(current.authorizationEpoch) ||
          (canBrowseUsers && !current.perms.includes('system:user:list'))
        ) {
          setAccessDenied(true)
          setDraft(null)
          setProfiles(new Map())
          setAddOpen(false)
          setReviewing(false)
          return
        }
        if (!canManageRoleRelations(current)) {
          setDraft((prev) => (prev ? resetRoleMemberDraft(prev) : null))
          setAddOpen(false)
          setReviewing(false)
          setSaveError(null)
        }
      }),
    [epoch, canBrowseUsers],
  )

  const denial = useResourceDenial({
    errors: [membersQuery.error, canEdit ? baselineQuery.error : null],
    clear: membersResource.filter,
    reset: () => {
      setAccessDenied(true)
      setDraft(null)
      setProfiles(new Map())
      setAddOpen(false)
      setReviewing(false)
    },
  })

  const mutation = useRoleGraphMutation<{ baselineUserIds: string[]; userIds: string[] }, void>({
    requiredPerms: requiredEditPerms,
    requiredAllScopePerms: ['system:role:edit'],
    localKey: `${epoch}:${roleId}:${loadId}`,
    onDenied: denial,
    mutationFn: (variables, transport) => saveRoleMembers(transport, { roleId, ...variables }),
    onSuccess: () => {
      toast.success(t('roleMemberEdit.saved'))
      setReviewing(false)
      setAddOpen(false)
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
  const disabled = mutation.isPending || conflict || baselineQuery.isFetching

  const reloadBaseline = () => {
    setSaveError(null)
    setReviewing(false)
    setLoadId(crypto.randomUUID())
  }

  const toggleMemberId = (id: string) => {
    if (!canEdit || disabled) return
    setSaveError(null)
    setDraft((prev) => (prev ? toggleRoleMember(prev, id) : prev))
  }

  const undoMemberId = (id: string) => {
    if (!canEdit || mutation.isPending || conflict) return
    setSaveError(null)
    setDraft((prev) => (prev ? undoRoleMember(prev, id) : prev))
  }

  if (
    accessDenied ||
    isResourceDenied(membersQuery.error) ||
    (canEdit && isResourceDenied(baselineQuery.error))
  ) {
    return (
      <div className="space-y-3 rounded-panel border border-border-subtle bg-card p-6" role="alert">
        <p className="text-sm font-medium">{t('roleMemberEdit.denied')}</p>
        <Button variant="outline" size="sm" onClick={reloadBaseline}>
          {t('roleMemberEdit.retry')}
        </Button>
      </div>
    )
  }

  if (membersQuery.isError || (canEdit && baselineQuery.isError)) {
    const err = (canEdit ? baselineQuery.error : null) ?? membersQuery.error
    return (
      <div className="space-y-3 rounded-panel border border-border-subtle bg-card p-6" role="alert">
        <p className="text-sm font-medium">{t('roleMemberEdit.loadFailed')}</p>
        {err instanceof ApiError && <p className="text-xs text-muted-foreground">{err.message}</p>}
        <Button variant="outline" size="sm" onClick={reloadBaseline}>
          {t('roleMemberEdit.retry')}
        </Button>
      </div>
    )
  }

  if (membersQuery.isPending || (canEdit && (!draft || baselineQuery.isFetching))) {
    return (
      <div role="status" aria-label={t('roleMemberEdit.loading')} className="space-y-3">
        <Skeleton className="h-12 w-full rounded-panel" />
        <Skeleton className="h-72 w-full rounded-panel" />
      </div>
    )
  }

  const visibleList = membersQuery.data?.list ?? []
  const pendingAddedRows = changes.added
    .filter((id) => !visibleList.some((member) => member.id === id))
    .map(
      (id): RoleGraphMember =>
        profiles.get(id) ?? { id, username: id, nickname: null, status: null },
    )
  const displayRows = [...pendingAddedRows, ...visibleList]
  const unread = draft ? unreadRoleMemberIds(draft, profiles) : []

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

      {pendingMember && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-brand-text/40 bg-primary/5 px-4 py-2.5 text-sm"
        >
          <div>
            <p className="font-medium text-foreground">
              {t('roleManage.pendingMember', { name: pendingMember.keyword })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('roleManage.pendingMemberHint', { id: pendingMember.userId })}
            </p>
          </div>
          {canEdit && canBrowseUsers && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <UserPlus className="size-3.5" />
              {t('roleMemberEdit.candidates')}
            </Button>
          )}
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
                ? t('roleMemberEdit.conflict')
                : saveError instanceof ApiError
                  ? saveError.message
                  : t('roleMemberEdit.failed')}
            </p>
          </div>
          {conflict && (
            <Button variant="outline" size="sm" onClick={reloadBaseline}>
              {t('roleMemberEdit.retry')}
            </Button>
          )}
        </div>
      )}

      {unread.length > 0 && draft && (
        <details className="rounded-control border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            {t('roleMemberEdit.completeCount', { count: draft.baseline.size })} ·{' '}
            {t('roleMemberEdit.otherIds')} ({unread.length})
          </summary>
          <p className="mt-1.5 text-muted-foreground">{t('roleMemberEdit.unknownHint')}</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {unread.map((id) => {
              const linked = draft.selected.has(id)
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-card px-2.5 py-1.5"
                >
                  <code className="truncate font-mono">{id}</code>
                  {canEdit && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => toggleMemberId(id)}
                    >
                      {linked ? t('authorization.remove') : t('authorization.add')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {dirty && canEdit && draft && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-brand-text/40 bg-primary/5 px-4 py-2.5"
        >
          <span className="text-sm font-medium text-foreground">
            {t('roleMemberEdit.changesCount', {
              added: changes.added.length,
              removed: changes.removed.length,
            })}{' '}
            ·{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {t('roleMemberEdit.selectedCount', { count: draft.selected.size })}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => {
                setDraft((prev) => (prev ? resetRoleMemberDraft(prev) : prev))
                setSaveError(null)
              }}
            >
              <RotateCcw className="size-3.5" />
              {t('roleMemberEdit.reset')}
            </Button>
            <Button type="button" size="sm" disabled={disabled} onClick={() => setReviewing(true)}>
              <Save className="size-3.5" />
              {t('roleMemberEdit.review')}
            </Button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-panel border border-border-subtle bg-card shadow-surface">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border-subtle bg-muted/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-foreground">{t('roleMemberEdit.visible')}</span>
            <Badge variant="outline" className="tabular-nums">
              {membersQuery.data?.total ?? 0}
            </Badge>
            {draft && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {t('roleMemberEdit.completeCount', { count: draft.baseline.size })}
              </span>
            )}
          </div>
          {canEdit && canBrowseUsers && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              {t('roleMemberEdit.candidates')}
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{commonT('common.用户名', { defaultValue: '用户名' })}</TableHead>
                <TableHead>{commonT('common.显示名称', { defaultValue: '显示名称' })}</TableHead>
                <TableHead className="w-36">
                  {commonT('common.状态', { defaultValue: '状态' })}
                </TableHead>
                <TableHead className="w-36 text-right">
                  {commonT('common.操作', { defaultValue: '操作' })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-28 text-center text-muted-foreground">
                    {t('roleMemberEdit.noRows')}
                  </TableCell>
                </TableRow>
              )}
              {displayRows.map((member) => {
                const name = member.nickname || member.username
                const linkState = draft ? roleMemberLinkState(draft, member.id) : 'linked'
                const isSelected = draft ? draft.selected.has(member.id) : true
                return (
                  <TableRow
                    key={member.id}
                    className={
                      linkState === 'added' || linkState === 'removed' ? 'bg-primary/5' : undefined
                    }
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      {member.username}
                    </TableCell>
                    <TableCell>{member.nickname || '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {member.status !== null && (
                          <Badge variant={member.status === 1 ? 'success' : 'secondary'}>
                            {t(
                              member.status === 1
                                ? 'authorization.active'
                                : 'authorization.inactive',
                            )}
                          </Badge>
                        )}
                        {linkState === 'added' && (
                          <Badge variant="success">{t('roleMemberEdit.added')}</Badge>
                        )}
                        {linkState === 'removed' && (
                          <Badge variant="destructive">{t('roleMemberEdit.removed')}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit ? (
                        linkState === 'added' || linkState === 'removed' ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={disabled}
                            aria-label={t('roleMemberEdit.undoNamed', { name })}
                            onClick={() => undoMemberId(member.id)}
                          >
                            <RotateCcw className="size-3.5" />
                            <span>{t('authorization.undo')}</span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={disabled}
                            aria-label={t(
                              isSelected ? 'roleMemberEdit.removeNamed' : 'roleMemberEdit.addNamed',
                              { name },
                            )}
                            onClick={() => toggleMemberId(member.id)}
                          >
                            <Unlink className="size-3.5" />
                            <span>{t('authorization.remove')}</span>
                          </Button>
                        )
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {membersQuery.data && (
        <DynaPagination
          page={memberPage}
          size={ROLE_MEMBERS_PAGE_SIZE}
          total={membersQuery.data.total}
          disabled={disabled || membersQuery.isFetching}
          onPageChange={setMemberPage}
        />
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('roleMemberEdit.candidates')}</DialogTitle>
            <DialogDescription>{t('roleMemberEdit.rules')}</DialogDescription>
          </DialogHeader>

          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setCandidatePage(1)
              setCandidateKeyword(candidateDraft.trim())
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={candidateDraft}
                onChange={(event) => setCandidateDraft(event.target.value)}
                aria-label={t('roleMemberEdit.search')}
                placeholder={t('roleMemberEdit.searchPlaceholder')}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline">
              {t('roleMemberEdit.searchAction')}
            </Button>
          </form>

          <div className="max-h-80 overflow-y-auto rounded-control border border-border-subtle">
            {candidateQuery.isPending ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t('roleMemberEdit.loading')}
              </p>
            ) : (candidateQuery.data?.list ?? []).length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t('roleMemberEdit.noCandidates')}
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {(candidateQuery.data?.list ?? []).map((member) => {
                  const name = member.nickname || member.username
                  const selected = draft?.selected.has(member.id) ?? false
                  return (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {member.username}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="xs"
                        variant={selected ? 'secondary' : 'outline'}
                        disabled={disabled}
                        aria-label={t(
                          selected ? 'roleMemberEdit.removeNamed' : 'roleMemberEdit.addNamed',
                          { name },
                        )}
                        onClick={() => toggleMemberId(member.id)}
                      >
                        {selected ? <Unlink className="size-3.5" /> : <Plus className="size-3.5" />}
                        <span>{t(selected ? 'authorization.remove' : 'authorization.add')}</span>
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {candidateQuery.data && (
            <DynaPagination
              page={candidatePage}
              size={ROLE_MEMBERS_PAGE_SIZE}
              total={candidateQuery.data.total}
              disabled={disabled || candidateQuery.isFetching}
              onPageChange={setCandidatePage}
            />
          )}

          <DialogFooter>
            <Button type="button" onClick={() => setAddOpen(false)}>
              {t('authorization.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={reviewing} onOpenChange={setReviewing}>
        <AlertDialogContent className="sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('roleMemberEdit.reviewTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('roleMemberEdit.reviewHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-80 space-y-3 overflow-y-auto py-2">
            {draft && draft.selected.size === 0 && (
              <p className="rounded-control border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                {t('roleMemberEdit.emptyWarning')}
              </p>
            )}
            {changes.added.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">{t('roleMemberEdit.added')}</p>
                <ul className="space-y-1">
                  {changes.added.map((id) => {
                    const p = profiles.get(id)
                    const label = p ? `${p.nickname || p.username} (@${p.username})` : id
                    return (
                      <li
                        key={`add-${id}`}
                        className="flex items-center justify-between gap-2 rounded-control border border-border-subtle px-3 py-1.5 text-xs"
                      >
                        <span className="truncate">{label}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => undoMemberId(id)}
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
                  {t('roleMemberEdit.removed')}
                </p>
                <ul className="space-y-1">
                  {changes.removed.map((id) => {
                    const p = profiles.get(id)
                    const label = p ? `${p.nickname || p.username} (@${p.username})` : id
                    return (
                      <li
                        key={`rm-${id}`}
                        className="flex items-center justify-between gap-2 rounded-control border border-border-subtle px-3 py-1.5 text-xs"
                      >
                        <span className="truncate">{label}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => undoMemberId(id)}
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
              {t('roleMemberEdit.continueEditing')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || !dirty || !draft}
              onClick={(event) => {
                event?.preventDefault()
                if (!draft) return
                mutation.mutate({
                  baselineUserIds: [...draft.baseline],
                  userIds: [...draft.selected],
                })
              }}
            >
              {mutation.isPending ? t('roleMemberEdit.saving') : t('roleMemberEdit.save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
