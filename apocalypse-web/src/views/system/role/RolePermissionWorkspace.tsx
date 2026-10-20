/** Desktop object and relationship management, using the existing role contracts. */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router'
import {
  KeyRound,
  LayoutList,
  Network,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'

import { RoleGraphPagination, RolePermissionGraph } from './RolePermissionGraph'
import { RolePermissionView } from './RolePermissionView'
import { RoleMemberRelations } from './RoleMemberRelations'
import { RoleBusinessPermissions } from './RoleBusinessPermissions'
import { RolePanorama } from './RolePanorama'
import { RoleAuthorizationChain } from './RoleAuthorizationChain'
import { canAskAuthorizationQuestions } from './authorization-questions.model'
import { RoleGraphCrudPanel, RoleGraphObjectActions } from './role-graph-crud'
import { roleGraphCommandPerm, type RoleGraphCommand } from './role-graph-crud.model'
import {
  ROLE_CHOICES_PAGE_SIZE,
  ROLE_MEMBERS_PAGE_SIZE,
  createRoleChoicesQuery,
} from './role-permission.queries'
import { useRolePanelWidth } from './useRolePanelWidth'
import type { RoleMemberContext } from './role-member-context'
import './role-workspace.css'
import {
  canReadRolePermissionGraph,
  canReadRoleWorkspace,
  buildRolePermissionModel,
  resolveRolePermissionOpening,
  synchronizeRolePermissionSelection,
  type RolePermissionOpening,
  type RolePermissionTarget,
} from './role-permission.model'

const emptyModel = buildRolePermissionModel([], [])
type RelationCounts = Partial<Record<'permissions' | 'navigation' | 'members', number>>

export function RolePermissionWorkspace({
  principalEpoch,
  presentation = 'graph',
  memberContext,
  viewControl,
  onBusyChange,
}: {
  principalEpoch: number
  presentation?: 'graph' | 'list'
  memberContext?: RoleMemberContext
  viewControl: ReactNode
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useTranslation('system')
  const auth = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const queryClient = useQueryClient()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const locatorWide = useRolePanelWidth(workspaceRef, 'locator')
  const [locatorExpanded, setLocatorExpanded] = useState(true)
  const [locatorDrawerOpen, setLocatorDrawerOpen] = useState(false)
  const [workspaceId] = useState(() => crypto.randomUUID())
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState(() => searchParams.get('roleKey') ?? '')
  const [keyword, setKeyword] = useState(() => searchParams.get('roleKey') ?? '')
  const [selection, setSelection] = useState<RolePermissionOpening | null>(null)
  const [command, setCommand] = useState<RoleGraphCommand | null>(null)
  const [editingMenus, setEditingMenus] = useState(false)
  const [editingMembers, setEditingMembers] = useState(false)
  const [relationObject, setRelationObject] = useState<{
    roleId: string
    relation: 'permissions' | 'navigation' | 'members'
    id: string
    index: number
  } | null>(null)
  const [relationCounts, setRelationCounts] = useState<RelationCounts & { roleId?: string }>({})
  const [relation, setRelation] = useState<'chain' | 'permissions' | 'navigation' | 'members'>(
    () =>
      memberContext || searchParams.get('roleRelation') === 'members'
        ? 'members'
        : searchParams.get('roleRelation') === 'chain'
          ? 'chain'
          : ['navigation', 'menus'].includes(searchParams.get('roleRelation') ?? '')
            ? 'navigation'
            : 'permissions',
  )
  // L0 permission overview: graph presentation without a requested role, for readers of both the
  // role list and the permission catalog. Choosing a role leaves it; the breadcrumb returns.
  const canOverview = presentation === 'graph' && canAskAuthorizationQuestions(auth)
  const [overview, setOverview] = useState(() => !memberContext && !searchParams.get('roleId'))
  const showOverview = overview && canOverview
  const [mutationDenied, setMutationDenied] = useState(false)
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [created, setCreated] = useState<{
    id: string
    keyword: string
    requestedAt: number
    unavailable?: boolean
  } | null>(() => {
    const id = searchParams.get('roleId')
    return id ? { id, keyword: searchParams.get('roleKey') ?? '', requestedAt: 0 } : null
  })
  const busy = command !== null || editingMenus || editingMembers
  // A departing relationship view must not unlock a concurrently opening object editor.
  useLayoutEffect(() => onBusyChange(busy), [busy, onBusyChange])
  useLayoutEffect(() => () => onBusyChange(false), [onBusyChange])
  useLayoutEffect(
    () =>
      useAuthStore.subscribe((current) => {
        if (command && !current.allScopePerms.includes(roleGraphCommandPerm(command))) {
          setCommand(null)
        }
      }),
    [command],
  )
  const resource = useMemo(
    () => createRoleChoicesQuery({ page, keyword, principalEpoch, openId: workspaceId }),
    [page, keyword, principalEpoch, workspaceId],
  )
  const result = useQuery(resource.options)
  const denied = isResourceDenied(result.error)
  useResourceDenial({
    errors: [result.error],
    clear: resource.filter,
    reset: () => {
      setSelection(null)
      setCommand(null)
      setCreated(null)
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

  const chooseRole = (role: RolePermissionTarget) => {
    const current = useAuthStore.getState()
    if (busy || current.sessionEpoch !== principalEpoch || !canReadRoleWorkspace(current)) return
    setCreated(null)
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('roleId', role.id)
        next.set('roleKey', role.roleKey)
        return next
      },
      { replace: true, state: location.state },
    )
    if (showOverview) setRelation('chain')
    setOverview(false)
    setLocatorDrawerOpen(false)
    setSelection({ role, principalEpoch, openId: crypto.randomUUID() })
  }
  const returnToOverview = () => {
    if (busy) return
    setOverview(true)
    setSelection(null)
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('roleId')
        next.delete('roleKey')
        next.delete('roleRelation')
        return next
      },
      { replace: true, state: location.state },
    )
  }
  const roles = (result.data?.list ?? []).filter((role) => !deletedIds.has(role.id))
  const acceptedSelection = synchronizeRolePermissionSelection(selection, denied ? [] : roles)
  if (acceptedSelection !== selection) setSelection(acceptedSelection)
  const opening =
    denied || mutationDenied || created !== null || showOverview || (memberContext && !selection)
      ? null
      : resolveRolePermissionOpening(selection, roles, principalEpoch, workspaceId)

  const openingRoleId = opening?.role.id
  const openingRoleKey = opening?.role.roleKey
  const updateRelationCounts = (counts: RelationCounts) => {
    if (!openingRoleId) return
    setRelationCounts((previous) => {
      const current = previous.roleId === openingRoleId ? previous : {}
      if (
        previous.roleId === openingRoleId &&
        Object.entries(counts).every(
          ([relation, count]) => current[relation as keyof RelationCounts] === count,
        )
      )
        return previous
      return { ...current, ...counts, roleId: openingRoleId }
    })
  }
  const countCallbacks = {
    permissions: (count: number) => updateRelationCounts({ permissions: count }),
    navigation: (count: number) => updateRelationCounts({ navigation: count }),
    members: (count: number) => updateRelationCounts({ members: count }),
  }
  const relationLabel = (kind: keyof RelationCounts, label: string) => {
    const count = relationCounts.roleId === openingRoleId ? relationCounts[kind] : undefined
    if (count === undefined) return label
    return `${label} · ${kind === 'members' ? t('roleManage.visibleCount', { count }) : count}`
  }
  useLayoutEffect(() => {
    if (!openingRoleId || openingRoleKey === undefined || created) return
    if (
      searchParams.get('roleId') === openingRoleId &&
      searchParams.get('roleKey') === openingRoleKey
    )
      return
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('roleId', openingRoleId)
        next.set('roleKey', openingRoleKey)
        return next
      },
      { replace: true, state: location.state },
    )
  }, [openingRoleId, openingRoleKey, created, searchParams, setSearchParams, location.state])

  const pageCount = Math.max(1, Math.ceil((result.data?.total ?? 0) / ROLE_CHOICES_PAGE_SIZE))
  if (
    created &&
    !created.unavailable &&
    keyword === created.keyword &&
    result.data &&
    result.dataUpdatedAt >= created.requestedAt &&
    !result.isFetching &&
    !result.error
  ) {
    const match = roles.find((role) => role.id === created.id)
    if (match) {
      setSelection({ role: match, principalEpoch, openId: crypto.randomUUID() })
      setCreated(null)
    } else if (page < pageCount) setPage(page + 1)
    else setCreated({ ...created, unavailable: true })
  }
  const closeCommand = () => {
    setCommand(null)
    requestAnimationFrame(() => {
      const target =
        workspaceRef.current?.querySelector<HTMLButtonElement>(
          '[data-role-choice][aria-pressed="true"]',
        ) ??
        workspaceRef.current?.querySelector<HTMLButtonElement>('[data-role-locator-trigger]') ??
        workspaceRef.current?.querySelector<HTMLButtonElement>('[data-create-role]')
      target?.focus({ preventScroll: true })
    })
  }
  const beginCommand = (kind: RoleGraphCommand['kind']) => {
    if (busy || mutationDenied || !canReadRoleWorkspace(useAuthStore.getState())) return
    const next: RoleGraphCommand | null =
      kind === 'create'
        ? { id: crypto.randomUUID(), kind }
        : opening
          ? { id: crypto.randomUUID(), kind, role: opening.role }
          : null
    if (!next || !useAuthStore.getState().allScopePerms.includes(roleGraphCommandPerm(next))) return
    setCreated(null)
    setRelation('permissions')
    setCommand(next)
  }
  const roleLocator = (
    <section
      className="role-choice-panel min-w-0 space-y-3 rounded-panel border border-border-subtle bg-card p-3 shadow-surface"
      aria-label={t('roleGraph.rolePicker')}
    >
      <form
        role="search"
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy || mutationDenied) return
          setCreated(null)
          setPage(1)
          setKeyword(draft.trim())
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t('roleGraph.roleSearchLabel')}
            placeholder={t('roleGraph.roleSearchPlaceholder')}
            value={draft}
            disabled={busy || mutationDenied}
            onChange={(event) => setDraft(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          disabled={busy || mutationDenied}
          aria-label={t('roleGraph.query')}
        >
          <Search className="size-4" />
        </Button>
      </form>
      {denied || mutationDenied || (!result.data && result.error) ? (
        <div className="rounded-2xl border border-border bg-card p-5" role="alert">
          <h2 className="text-sm font-semibold">
            {t(denied || mutationDenied ? 'roleGraph.denied' : 'roleGraph.rolesFailed')}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mutationDenied
              ? t('roleManage.denied', {
                  defaultValue: '当前操作被拒绝，已清除角色编辑上下文。请重新加载角色。',
                })
              : result.error instanceof ApiError
                ? result.error.message
                : t('roleGraph.rolesFailed')}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            disabled={result.isFetching}
            onClick={() => {
              setMutationDenied(false)
              void result.refetch()
            }}
          >
            {t('roleGraph.retry')}
          </Button>
        </div>
      ) : !result.data ? (
        <div
          className="role-choice-grid grid gap-1"
          role="status"
          aria-label={t('roleGraph.rolesLoading')}
        >
          {Array.from({ length: ROLE_CHOICES_PAGE_SIZE }, (_, index) => (
            <Skeleton key={index} className="h-12 rounded-control" />
          ))}
        </div>
      ) : (
        <>
          {result.error && (
            <p
              className="rounded-xl border border-warning px-4 py-3 text-xs text-muted-foreground"
              role="alert"
            >
              {t('roleGraph.refreshFailed')}
            </p>
          )}
          {roles.length > 0 ? (
            <div className="role-choice-grid grid gap-1">
              {roles.map((role) => {
                const selected = opening?.role.id === role.id
                return (
                  <button
                    type="button"
                    data-role-choice
                    disabled={busy}
                    key={role.id}
                    className="role-choice-row flex min-w-0 items-center gap-3 rounded-control px-3 py-2 text-left"
                    aria-pressed={selected}
                    aria-label={t('roleGraph.chooseRole', { name: role.roleName })}
                    onClick={() => chooseRole(role)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" title={role.roleName}>
                        {role.roleName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {role.roleKey}
                      </span>
                    </span>
                    <span
                      className="role-choice-status inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
                      data-status={role.status}
                    >
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                      {t(
                        role.status === 1
                          ? 'roleGraph.enabled'
                          : role.status === 0
                            ? 'roleGraph.disabled'
                            : 'roleGraph.unknown',
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="rounded-control bg-muted/40 p-4">
              <h2 className="text-sm font-semibold">{t('roleGraph.rolesEmpty')}</h2>
              <p className="mt-2 text-xs text-muted-foreground">{t('roleGraph.rolesEmptyHelp')}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-1 pt-3">
            <span className="text-xs text-muted-foreground" role="status">
              {t('roleGraph.rolesCount', { count: result.data.total })}
            </span>
            <fieldset disabled={busy}>
              <RoleGraphPagination
                page={page - 1}
                pages={pageCount}
                onPage={(next) => {
                  if (!busy) {
                    setCreated(null)
                    setPage(next + 1)
                  }
                }}
              />
            </fieldset>
          </div>
        </>
      )}
    </section>
  )
  return (
    <div ref={workspaceRef} className="role-permission-workspace-page min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t('roleManage.title', { defaultValue: '角色管理' })}
        description={t('roleManage.description', {
          defaultValue: '管理角色属性、业务权限、导航分配与成员关系。',
        })}
        view={viewControl}
        actions={
          <>
            <Button
              data-role-locator-trigger
              type="button"
              variant="outline"
              aria-expanded={locatorWide ? locatorExpanded : locatorDrawerOpen}
              onClick={() => {
                if (locatorWide) setLocatorExpanded((value) => !value)
                else setLocatorDrawerOpen(true)
              }}
            >
              {locatorWide && locatorExpanded ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeftOpen className="size-4" />
              )}
              {t(
                locatorWide && locatorExpanded
                  ? 'roleManage.hideLocator'
                  : 'roleManage.showLocator',
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={result.isFetching || busy}
              aria-label={t('roleGraph.refreshRoles')}
              onClick={() => {
                setMutationDenied(false)
                void result.refetch()
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
            {auth.allScopePerms.includes('system:role:add') && (
              <Button
                data-create-role
                disabled={busy || mutationDenied}
                onClick={() => beginCommand('create')}
              >
                <Plus className="size-4" />
                {t('roleManage.create', { defaultValue: '新增角色' })}
              </Button>
            )}
          </>
        }
      />
      {memberContext && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-card px-4 py-3 text-sm"
          role="status"
        >
          <div>
            <p className="font-medium">
              {t('roleManage.pendingMember', { name: memberContext.keyword })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('roleManage.pendingMemberHint', { id: memberContext.userId })}
            </p>
          </div>
          {!opening && (
            <Button
              variant="outline"
              onClick={() => {
                if (locatorWide) setLocatorExpanded(true)
                else setLocatorDrawerOpen(true)
              }}
            >
              {t('roleManage.showLocator')}
            </Button>
          )}
        </div>
      )}
      <div
        className="role-permission-main-layout grid min-w-0 items-start gap-6"
        data-locator={locatorWide && locatorExpanded ? 'inline' : 'hidden'}
      >
        {locatorWide && locatorExpanded && roleLocator}
        {!denied && !mutationDenied && (
          <div className="min-w-0 space-y-4">
            {created && (
              <p
                className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
                role="status"
              >
                {created.unavailable
                  ? t('roleManage.createdUnavailable', {
                      defaultValue: '当前可读结果中未找到所选角色，请刷新或选择其他角色。',
                    })
                  : t('roleManage.findingCreated', { defaultValue: '正在读取所选角色节点…' })}
              </p>
            )}
            {command ? (
              <RoleGraphCrudPanel
                key={command.id}
                command={command}
                clearQueries={{
                  predicate: (query) => {
                    const key = query.queryKey
                    if (key[0] !== 'system' || key[1] !== 'roles') return false
                    return (
                      (key[2] === 'permission-graph-choices' &&
                        key[3] === principalEpoch &&
                        key[4] === workspaceId) ||
                      (command.kind !== 'create' && key[2] === command.role.id)
                    )
                  },
                }}
                onDenied={() => {
                  setMutationDenied(true)
                  setCommand(null)
                  setSelection(null)
                  setCreated(null)
                  setRelation('permissions')
                  setSearchParams(
                    (previous) => {
                      const next = new URLSearchParams(previous)
                      next.delete('roleId')
                      next.delete('roleKey')
                      return next
                    },
                    { replace: true, state: location.state },
                  )
                }}
                onClose={closeCommand}
                onCreated={(id, search) => {
                  setOverview(false)
                  setSearchParams(
                    (previous) => {
                      const next = new URLSearchParams(previous)
                      next.set('roleId', id)
                      next.set('roleKey', search)
                      return next
                    },
                    { replace: true, state: location.state },
                  )
                  closeCommand()
                  setSelection(null)
                  setPage(1)
                  setDraft(search)
                  setKeyword(search)
                  setCreated({ id, keyword: search, requestedAt: Date.now() })
                }}
                onUpdated={(id, search) => {
                  setSearchParams(
                    (previous) => {
                      const next = new URLSearchParams(previous)
                      next.set('roleId', id)
                      next.set('roleKey', search)
                      return next
                    },
                    { replace: true, state: location.state },
                  )
                  closeCommand()
                  setPage(1)
                  setDraft(search)
                  setKeyword(search)
                  setCreated({ id, keyword: search, requestedAt: Date.now() })
                }}
                onDeleted={(id) => {
                  setSearchParams(
                    (previous) => {
                      const next = new URLSearchParams(previous)
                      next.delete('roleId')
                      next.delete('roleKey')
                      return next
                    },
                    { replace: true, state: location.state },
                  )
                  closeCommand()
                  setDeletedIds((previous) => new Set([...previous, id]))
                  setSelection(null)
                }}
              />
            ) : showOverview ? (
              <RolePanorama
                roles={roles}
                rolePage={page}
                rolePages={pageCount}
                onRolePage={(next) => {
                  if (!busy) {
                    setCreated(null)
                    setPage(next)
                  }
                }}
                onChooseRole={chooseRole}
              />
            ) : opening ? (
              <>
                <div className="role-context-bar flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {canOverview && (
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        onClick={returnToOverview}
                        aria-label={t('panorama.title')}
                        title={t('panorama.title')}
                      >
                        <Network aria-hidden="true" className="size-4" />
                      </Button>
                    )}
                    <span className="role-permission-role-icon flex size-10 shrink-0 items-center justify-center rounded-control">
                      <ShieldCheck className="size-5" strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold break-words">
                        {opening.role.roleName}
                        <Badge variant={opening.role.status === 1 ? 'success' : 'secondary'}>
                          {t(
                            opening.role.status === 1
                              ? 'roleGraph.enabled'
                              : opening.role.status === 0
                                ? 'roleGraph.disabled'
                                : 'roleGraph.unknown',
                          )}
                        </Badge>
                      </h2>
                      <p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">
                        {opening.role.roleKey}
                      </p>
                    </div>
                  </div>
                  <RoleGraphObjectActions
                    role={opening.role}
                    disabled={busy}
                    onCommand={beginCommand}
                  />
                </div>
                <SegmentedControl
                  label={t('roleGraph.relations')}
                  value={relation}
                  disabled={busy}
                  onChange={(target) => {
                    setRelation(target)
                    setSearchParams(
                      (previous) => {
                        const next = new URLSearchParams(previous)
                        next.set('roleRelation', target)
                        return next
                      },
                      { replace: true, state: location.state },
                    )
                  }}
                  options={[
                    ...(presentation === 'graph'
                      ? [{ value: 'chain' as const, label: t('panorama.chain'), icon: Network }]
                      : []),
                    {
                      value: 'permissions' as const,
                      label: relationLabel('permissions', t('authorization.permissions')),
                      icon: KeyRound,
                    },
                    {
                      value: 'navigation' as const,
                      label: relationLabel('navigation', t('authorization.navigation')),
                      icon: LayoutList,
                    },
                    {
                      value: 'members' as const,
                      label: relationLabel('members', t('authorization.members')),
                      icon: Users,
                    },
                  ]}
                />
                {relation === 'chain' && presentation === 'graph' ? (
                  <RoleAuthorizationChain
                    key={opening.openId}
                    opening={opening}
                    onCountsChange={updateRelationCounts}
                    onEdit={(target, id, index) => {
                      setRelationObject({ roleId: opening.role.id, relation: target, id, index })
                      setRelation(target)
                      setSearchParams(
                        (previous) => {
                          const next = new URLSearchParams(previous)
                          next.set('roleRelation', target)
                          return next
                        },
                        { replace: true, state: location.state },
                      )
                    }}
                  />
                ) : relation === 'members' ? (
                  <RoleMemberRelations
                    key={opening.openId}
                    opening={opening}
                    presentation={presentation}
                    candidateKeyword={memberContext?.keyword}
                    initialSelectedId={
                      relationObject?.roleId === opening.role.id &&
                      relationObject.relation === 'members'
                        ? relationObject.id
                        : null
                    }
                    initialPage={
                      relationObject?.roleId === opening.role.id &&
                      relationObject.relation === 'members'
                        ? Math.floor(relationObject.index / ROLE_MEMBERS_PAGE_SIZE) + 1
                        : 1
                    }
                    onEditingChange={setEditingMembers}
                    onCountChange={countCallbacks.members}
                    onClose={() => {
                      setRelation('permissions')
                      setSearchParams(
                        (previous) => {
                          const next = new URLSearchParams(previous)
                          next.set('roleRelation', 'permissions')
                          return next
                        },
                        { replace: true, state: location.state },
                      )
                    }}
                  />
                ) : relation === 'permissions' ? (
                  <RoleBusinessPermissions
                    initialSelectedId={
                      relationObject?.roleId === opening.role.id &&
                      relationObject.relation === 'permissions'
                        ? relationObject.id
                        : null
                    }
                    opening={opening}
                    presentation={presentation}
                    onEditingChange={setEditingMenus}
                    onCountChange={countCallbacks.permissions}
                  />
                ) : canReadRolePermissionGraph(auth) ? (
                  <RolePermissionView
                    initialSelectedId={
                      relationObject?.roleId === opening.role.id &&
                      relationObject.relation === 'navigation'
                        ? relationObject.id
                        : null
                    }
                    opening={opening}
                    presentation={presentation}
                    onEditingChange={setEditingMenus}
                    onCountChange={countCallbacks.navigation}
                  />
                ) : (
                  <div className="overflow-hidden rounded-2xl border bg-card">
                    <RolePermissionGraph
                      model={emptyModel}
                      role={opening.role}
                      selectedId={null}
                      onSelect={() => undefined}
                      branchPage={0}
                      onBranchPage={() => undefined}
                    />
                    <p className="border-t p-4 text-sm text-muted-foreground">
                      {t('roleManage.menuUnavailable', {
                        defaultValue: '当前没有菜单读取权限，可继续管理角色属性与成员关系。',
                      })}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-card p-6 text-center">
                <ShieldCheck className="size-10 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">
                  {t('roleManage.chooseOrCreate', {
                    defaultValue: '选择一个角色，或创建新的角色节点。',
                  })}
                </p>
                {auth.allScopePerms.includes('system:role:add') && (
                  <Button onClick={() => beginCommand('create')}>
                    <Plus className="size-4" />
                    {t('roleManage.create', { defaultValue: '新增角色' })}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <Sheet open={!locatorWide && locatorDrawerOpen} onOpenChange={setLocatorDrawerOpen}>
        <SheetContent side="left" className="role-choice-drawer sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>{t('roleGraph.rolePicker')}</SheetTitle>
            <SheetDescription>{t('roleManage.locatorHint')}</SheetDescription>
          </SheetHeader>
          {roleLocator}
        </SheetContent>
      </Sheet>
    </div>
  )
}
