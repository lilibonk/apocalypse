/** Desktop object and relationship management, using the existing role contracts. */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Check, Plus, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'

import { RoleGraphPagination, RolePermissionGraph } from './RolePermissionGraph'
import { RolePermissionView } from './RolePermissionView'
import { RoleMemberRelations } from './RoleMemberRelations'
import { RoleBusinessPermissions } from './RoleBusinessPermissions'
import { RoleGraphCrudPanel, RoleGraphObjectActions } from './role-graph-crud'
import { roleGraphCommandPerm, type RoleGraphCommand } from './role-graph-crud.model'
import { ROLE_CHOICES_PAGE_SIZE, createRoleChoicesQuery } from './role-permission.queries'
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

export function RolePermissionWorkspace({
  principalEpoch,
  presentation = 'graph',
  viewControl,
  onBusyChange,
}: {
  principalEpoch: number
  presentation?: 'graph' | 'list'
  viewControl: ReactNode
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useTranslation('system')
  const auth = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [workspaceId] = useState(() => crypto.randomUUID())
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState(() => searchParams.get('roleKey') ?? '')
  const [keyword, setKeyword] = useState(() => searchParams.get('roleKey') ?? '')
  const [selection, setSelection] = useState<RolePermissionOpening | null>(null)
  const [command, setCommand] = useState<RoleGraphCommand | null>(null)
  const [editingMenus, setEditingMenus] = useState(false)
  const [editingMembers, setEditingMembers] = useState(false)
  const [relation, setRelation] = useState<'permissions' | 'navigation' | 'members'>(() =>
    searchParams.get('roleRelation') === 'members'
      ? 'members'
      : ['navigation', 'menus'].includes(searchParams.get('roleRelation') ?? '')
        ? 'navigation'
        : 'permissions',
  )
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
      { replace: true },
    )
    setSelection({ role, principalEpoch, openId: crypto.randomUUID() })
  }
  const roles = (result.data?.list ?? []).filter((role) => !deletedIds.has(role.id))
  const acceptedSelection = synchronizeRolePermissionSelection(selection, denied ? [] : roles)
  if (acceptedSelection !== selection) setSelection(acceptedSelection)
  const opening =
    denied || mutationDenied || created !== null
      ? null
      : resolveRolePermissionOpening(selection, roles, principalEpoch, workspaceId)

  const openingRoleId = opening?.role.id
  const openingRoleKey = opening?.role.roleKey
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
      { replace: true },
    )
  }, [openingRoleId, openingRoleKey, created, searchParams, setSearchParams])

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
        ) ?? workspaceRef.current?.querySelector<HTMLButtonElement>('[data-create-role]')
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
  return (
    <div ref={workspaceRef} className="role-permission-workspace-page min-w-0 space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('roleManage.title', { defaultValue: '角色管理' })}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('roleManage.description', {
              defaultValue: '选择角色节点，管理属性、菜单授权与成员关系。',
            })}
          </p>
        </div>
        {viewControl}
      </header>
      <div className="role-permission-main-layout grid min-w-0 items-start gap-5">
        <section
          className="role-choice-panel min-w-0 space-y-4"
          aria-label={t('roleGraph.rolePicker')}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{t('roleGraph.rolePicker')}</h2>
            <Button
              type="button"
              variant="ghost"
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
          </div>
          {auth.allScopePerms.includes('system:role:add') && (
            <Button
              className="w-full"
              variant="outline"
              data-create-role
              disabled={busy || mutationDenied}
              onClick={() => beginCommand('create')}
            >
              <Plus className="size-4" />
              {t('roleManage.create', { defaultValue: '新增角色' })}
            </Button>
          )}
          <form
            className="flex flex-wrap items-center justify-between gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (busy || mutationDenied) return
              setCreated(null)
              setPage(1)
              setKeyword(draft.trim())
            }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-sm">
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
                  className="h-10 pl-9"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                size="icon"
                disabled={busy || mutationDenied}
                aria-label={t('roleGraph.query')}
              >
                <Search className="size-4" />
              </Button>
            </div>
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
              className="role-choice-grid grid grid-cols-4 gap-3"
              role="status"
              aria-label={t('roleGraph.rolesLoading')}
            >
              {Array.from({ length: ROLE_CHOICES_PAGE_SIZE }, (_, index) => (
                <Skeleton key={index} className="h-20 rounded-2xl" />
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
                <div className="role-choice-grid grid grid-cols-4 gap-3">
                  {roles.map((role) => (
                    <button
                      type="button"
                      data-role-choice
                      disabled={busy}
                      key={role.id}
                      className="role-choice-card flex min-w-0 items-center gap-2 rounded-2xl border p-3 text-left"
                      aria-pressed={opening?.role.id === role.id}
                      aria-label={t('roleGraph.chooseRole', { name: role.roleName })}
                      onClick={() => chooseRole(role)}
                    >
                      <span className="role-permission-role-icon flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <ShieldCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-sm font-semibold"
                          title={role.roleName}
                        >
                          {role.roleName}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {t(
                            role.status === 1
                              ? 'roleGraph.enabled'
                              : role.status === 0
                                ? 'roleGraph.disabled'
                                : 'roleGraph.unknown',
                          )}
                        </span>
                      </span>
                      {opening?.role.id === role.id && (
                        <Check aria-hidden="true" className="role-choice-check size-4 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="text-sm font-semibold">{t('roleGraph.rolesEmpty')}</h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('roleGraph.rolesEmptyHelp')}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                    { replace: true },
                  )
                }}
                onClose={closeCommand}
                onCreated={(id, search) => {
                  setSearchParams(
                    (previous) => {
                      const next = new URLSearchParams(previous)
                      next.set('roleId', id)
                      next.set('roleKey', search)
                      return next
                    },
                    { replace: true },
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
                    { replace: true },
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
                    { replace: true },
                  )
                  closeCommand()
                  setDeletedIds((previous) => new Set([...previous, id]))
                  setSelection(null)
                }}
              />
            ) : opening ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="role-permission-role-icon flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <ShieldCheck className="size-5" strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-semibold">
                        {opening.role.roleName}
                      </h2>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {opening.role.roleKey}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleGraphObjectActions
                      role={opening.role}
                      disabled={busy}
                      onCommand={beginCommand}
                    />
                    {(['permissions', 'navigation', 'members'] as const).map((target) => (
                      <Button
                        key={target}
                        size="sm"
                        variant={relation === target ? 'default' : 'outline'}
                        disabled={busy}
                        aria-pressed={relation === target}
                        onClick={() => {
                          setRelation(target)
                          setSearchParams(
                            (previous) => {
                              const next = new URLSearchParams(previous)
                              next.set('roleRelation', target)
                              return next
                            },
                            { replace: true },
                          )
                        }}
                      >
                        {target === 'members' && <Users className="size-3.5" />}
                        {t(`authorization.${target}`)}
                      </Button>
                    ))}
                  </div>
                </div>
                {relation === 'members' ? (
                  <RoleMemberRelations
                    key={opening.openId}
                    opening={opening}
                    presentation={presentation}
                    onEditingChange={setEditingMembers}
                    onClose={() => {
                      setRelation('permissions')
                      setSearchParams(
                        (previous) => {
                          const next = new URLSearchParams(previous)
                          next.set('roleRelation', 'permissions')
                          return next
                        },
                        { replace: true },
                      )
                    }}
                  />
                ) : relation === 'permissions' ? (
                  <RoleBusinessPermissions
                    opening={opening}
                    presentation={presentation}
                    onEditingChange={setEditingMenus}
                  />
                ) : canReadRolePermissionGraph(auth) ? (
                  <RolePermissionView
                    opening={opening}
                    presentation={presentation}
                    onEditingChange={setEditingMenus}
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
    </div>
  )
}
