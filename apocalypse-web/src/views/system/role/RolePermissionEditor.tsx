/** Desktop relationship builder. Menu definitions are immutable; only role links are drafted. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  Info,
  Link2,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Unlink,
  X,
} from 'lucide-react'

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
import { insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { isAuthorizationCurrent, useAuthStore } from '@/stores/auth'

import { permissionNodeIcons } from './role-permission.icons'
import {
  canReadRolePermissionGraph,
  canManageRoleRelations,
  type RolePermissionNode,
  type RolePermissionOpening,
} from './role-permission.model'
import { createRoleMenuDraftQuery } from './role-permission.queries'
import {
  invalidateRoleGraphQueries,
  isRoleGraphConflict,
  saveRoleMenus,
} from './role-graph.operations'
import { useRoleGraphMutation } from './use-role-graph-mutation'
import {
  buildRolePermissionCatalog,
  createRolePermissionDraft,
  linkRolePermission,
  resetRolePermissionDraft,
  rolePermissionAdditions,
  rolePermissionCandidates,
  rolePermissionDraftChanges,
  rolePermissionDraftState,
  undoRolePermissionChange,
  unlinkRolePermission,
  unresolvedRolePermissionIds,
  unresolvedSelectedRolePermissionIds,
  type RolePermissionCatalog,
  type RolePermissionDraft,
  type RolePermissionDraftState,
} from './role-permission-draft.model'
import './role-permission-editor.css'

interface RolePermissionEditorProps {
  opening: RolePermissionOpening
  presentation?: 'graph' | 'list'
  initialNodeId?: string | null
  onClose: () => void
  onSaved: () => void
  /** Re-check the parent's readable projection after an object/write denial. */
  onResourceDenied?: () => void
}

interface DraftSession {
  revision: string
  catalog: RolePermissionCatalog
  draft: RolePermissionDraft
}

const GRAPH = { width: 780, height: 510, roleX: 150, roleY: 250, nodeX: 500 }
const PAGE_SIZE = 4
const requiredPerms = ['system:role:list', 'system:menu:list', 'system:role:edit'] as const

function DraftEdge({
  y,
  state,
  enabled,
}: {
  y: number
  state: RolePermissionDraftState
  enabled: boolean
}) {
  const target = {
    d: `M ${GRAPH.roleX} ${GRAPH.roleY} C 335 ${GRAPH.roleY}, 335 ${y}, ${GRAPH.nodeX} ${y}`,
  }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  return (
    <motion.path
      className="role-menu-editor-edge"
      data-state={state}
      initial={target}
      animate={controls}
    />
  )
}

function CandidateNode({
  node,
  y,
  state,
  selected,
  additions,
  disabled,
  enabled,
  onSelect,
  onExplore,
  onToggle,
}: {
  node: RolePermissionNode
  y: number
  state: RolePermissionDraftState
  selected: boolean
  additions: number
  disabled: boolean
  enabled: boolean
  onSelect: () => void
  onExplore: (keyboard: boolean) => void
  onToggle: () => void
}) {
  const { t } = useTranslation('system')
  const [hovered, setHovered] = useState(false)
  const Icon = permissionNodeIcons[node.type]
  const linked = state === 'linked' || state === 'added'
  const target = {
    left: `${(GRAPH.nodeX / GRAPH.width) * 100}%`,
    top: `${(y / GRAPH.height) * 100}%`,
    y: enabled && hovered ? -insightMotion.hoverLift : 0,
  }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  const labelTarget = {
    left: `${((GRAPH.nodeX + 45) / GRAPH.width) * 100}%`,
    top: `${(y / GRAPH.height) * 100}%`,
  }
  const labelControls = useSurfaceAnimation(labelTarget, enabled, insightMotion.layout)
  return (
    <>
      <motion.button
        type="button"
        className="role-menu-editor-node flex items-center justify-center"
        data-state={state}
        data-active={selected}
        aria-pressed={selected}
        aria-label={t('roleManage.inspectCandidate', {
          defaultValue: '查看节点：{{name}}',
          name: node.name,
        })}
        style={{ width: `${(56 / GRAPH.width) * 100}%` }}
        initial={target}
        animate={controls}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onClick={onSelect}
      >
        <Icon className="size-5" aria-hidden="true" strokeWidth={1.5} />
      </motion.button>
      <motion.div
        className="role-menu-editor-node-label space-y-2"
        style={{ width: `${(205 / GRAPH.width) * 100}%` }}
        initial={labelTarget}
        animate={labelControls}
      >
        <button
          type="button"
          className="block w-full truncate text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={node.pathNames.join(' / ')}
          onClick={onSelect}
        >
          {node.name}
        </button>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant={linked ? 'ghost' : 'outline'}
            size="xs"
            disabled={disabled}
            onClick={onToggle}
            aria-label={
              linked
                ? t('roleManage.removeNamedLink', {
                    defaultValue: '移除关联：{{name}}',
                    name: node.name,
                  })
                : t('roleManage.addNamedLinks', {
                    defaultValue: '添加关联：{{name}}，共 {{count}} 项（含上级）',
                    name: node.name,
                    count: additions,
                  })
            }
          >
            {linked ? <Unlink aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {linked
              ? t('roleManage.removeLink', { defaultValue: '移除关联' })
              : t('roleManage.addLinksCount', {
                  defaultValue: '关联 +{{count}}',
                  count: additions,
                })}
          </Button>
          {node.children.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              onClick={(event) => onExplore(event.detail === 0)}
              aria-label={t('roleManage.exploreChildren', {
                defaultValue: '展开下级：{{name}}',
                name: node.name,
              })}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </motion.div>
    </>
  )
}

function ChangeList({
  ids,
  state,
  catalog,
  disabled,
  onUndo,
}: {
  ids: readonly string[]
  state: 'added' | 'removed'
  catalog: RolePermissionCatalog
  disabled: boolean
  onUndo: (id: string) => void
}) {
  const { t } = useTranslation('system')
  return (
    <ul className="space-y-2">
      {ids.map((id) => {
        const node = catalog.byId.get(id)
        return (
          <li
            key={id}
            className="role-menu-editor-change flex items-start gap-2 rounded-xl border p-3"
            data-state={state}
          >
            {state === 'added' ? (
              <Plus className="mt-0.5 size-3.5 shrink-0 text-brand-text" aria-hidden="true" />
            ) : (
              <Unlink className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block break-words text-xs font-medium">
                {node?.name ?? t('roleManage.unresolvedLink', { defaultValue: '无法解析的关联' })}
              </span>
              <span className="mt-1 block break-words text-xs text-muted-foreground">
                {node?.pathNames.join(' / ')}
              </span>
              <code className="mt-1 block break-all text-xs text-muted-foreground">
                {node?.path || id}
              </code>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              onClick={() => onUndo(id)}
              aria-label={t('roleManage.undoNamedChange', {
                defaultValue: '还原此关联：{{name}}',
                name: node?.name ?? id,
              })}
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

export function RolePermissionEditor(props: RolePermissionEditorProps) {
  const auth = useAuthStore()
  const { t } = useTranslation('system')
  const epoch = props.opening.principalEpoch
  const [revoked, setRevoked] = useState(false)
  useLayoutEffect(
    () =>
      useAuthStore.subscribe((current) => {
        // An idle draft must not survive a revoke/regrant that is batched before React paints.
        if (
          !canReadRolePermissionGraph(current) ||
          !canManageRoleRelations(current) ||
          current.sessionEpoch !== epoch
        )
          setRevoked(true)
      }),
    [epoch],
  )
  if (
    revoked ||
    !canReadRolePermissionGraph(auth) ||
    !canManageRoleRelations(auth) ||
    auth.sessionEpoch !== epoch ||
    !isAuthorizationCurrent(auth.authorizationEpoch)
  ) {
    return (
      <div className="rounded-panel border border-border p-5" role="alert">
        <p className="text-sm">
          {t('roleManage.editorDenied', { defaultValue: '当前无法读取或编辑这些角色关联。' })}
        </p>
        <Button className="mt-4" variant="outline" onClick={props.onClose}>
          {t('roleManage.returnToGraph', { defaultValue: '返回图谱' })}
        </Button>
      </div>
    )
  }
  return (
    <RolePermissionEditorContent
      {...props}
      key={`${props.opening.openId}:${auth.authorizationEpoch}`}
    />
  )
}

function RolePermissionEditorContent({
  opening,
  presentation = 'graph',
  initialNodeId,
  onClose,
  onSaved,
  onResourceDenied,
}: RolePermissionEditorProps) {
  const { t } = useTranslation('system')
  const queryClient = useQueryClient()
  const enabled = useMotionPreference()
  const [loadId, setLoadId] = useState(() => crypto.randomUUID())
  const [session, setSession] = useState<DraftSession | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [reviewing, setReviewing] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const [leaving, setLeaving] = useState<'close' | 'reload' | null>(null)
  const currentBreadcrumb = useRef<HTMLButtonElement>(null)
  const restoreKeyboardFocus = useRef(false)
  useLayoutEffect(() => {
    if (!restoreKeyboardFocus.current) return
    const frame = requestAnimationFrame(() => {
      if (!restoreKeyboardFocus.current) return
      restoreKeyboardFocus.current = false
      currentBreadcrumb.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [parentId, keyword])
  const role = opening.role
  const roleId = role.id
  const epoch = opening.principalEpoch
  // Ownership follows the query identity. Refreshing the role's name/status must not
  // create a same-key owner whose predecessor would remove the active draft query.
  const resource = useMemo(
    () => createRoleMenuDraftQuery({ role: { id: roleId }, principalEpoch: epoch, openId: loadId }),
    [roleId, epoch, loadId],
  )
  const result = useQuery(resource.options)
  const denied = accessDenied || isResourceDenied(result.error)
  const denial = useResourceDenial({
    errors: [result.error],
    clear: resource.filter,
    reset: () => {
      setAccessDenied(true)
      setSession(null)
      setSelectedId(null)
      setParentId(null)
      setKeyword('')
      setReviewing(false)
      setSaveError(null)
      onResourceDenied?.()
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

  if (!session && result.data && !result.isFetching && !result.isError && !denied) {
    const catalog = buildRolePermissionCatalog(result.data.tree)
    setSession({
      catalog,
      revision: result.data.revision,
      draft: createRolePermissionDraft(result.data.menuIds),
    })
    const initial = initialNodeId ? catalog.byId.get(initialNodeId) : undefined
    setSelectedId(initial?.id ?? null)
    setParentId(initial?.pathIds.at(-2) ?? null)
  }

  const mutation = useRoleGraphMutation({
    localKey: `${epoch}:${role.id}:${loadId}`,
    requiredPerms,
    requiredAllScopePerms: ['system:role:edit'],
    onDenied: denial,
    mutationFn: (
      variables: { expectedRevision: string; baselineMenuIds: string[]; menuIds: string[] },
      transport,
    ) => saveRoleMenus(transport, { roleId: role.id, ...variables }),
    onSuccess: () => {
      void invalidateRoleGraphQueries(queryClient, role.id)
      onSaved()
    },
    onError: (error) => setSaveError(error),
  })

  const changes = session ? rolePermissionDraftChanges(session.draft) : { added: [], removed: [] }
  const dirty = changes.added.length > 0 || changes.removed.length > 0
  const conflict = isRoleGraphConflict(saveError)
  const restart = () => {
    setSession(null)
    setLoadId(crypto.randomUUID())
    setAccessDenied(false)
    setSelectedId(null)
    setParentId(null)
    setKeyword('')
    setPage(0)
    setReviewing(false)
    setSaveError(null)
    setLeaving(null)
  }
  const requestClose = () => {
    if (dirty) setLeaving('close')
    else onClose()
  }
  const requestReload = () => {
    if (dirty) setLeaving('reload')
    else restart()
  }
  const updateDraft = (update: (current: DraftSession) => RolePermissionDraft) => {
    if (mutation.isPending || reviewing) return
    setSession((current) => (current ? { ...current, draft: update(current) } : current))
    if (!conflict) setSaveError(null)
  }
  const toggle = (node: RolePermissionNode) => {
    setSelectedId(node.id)
    updateDraft((current) =>
      current.draft.selected.has(node.id)
        ? unlinkRolePermission(current.draft, node.id)
        : linkRolePermission(current.catalog, current.draft, node.id),
    )
  }
  const undo = (id: string) => {
    if (mutation.isPending) return
    setSession((current) =>
      current ? { ...current, draft: undoRolePermissionChange(current.draft, id) } : current,
    )
    if (!conflict) setSaveError(null)
  }

  if (denied || (!session && result.isError))
    return (
      <div className="rounded-panel border border-border bg-card p-6" role="alert">
        <h3 className="font-semibold">
          {t(denied ? 'roleManage.editorDenied' : 'roleManage.editorLoadFailed', {
            defaultValue: denied ? '当前无法读取或编辑这些角色关联。' : '授权编辑数据加载失败。',
          })}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.error instanceof ApiError
            ? result.error.message
            : t('roleManage.editorRetryHint', { defaultValue: '请重新读取服务端关联后再继续。' })}
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('roleManage.returnToGraph', { defaultValue: '返回图谱' })}
          </Button>
          <Button onClick={restart}>
            {t('roleManage.reloadBaseline', { defaultValue: '重新载入基线' })}
          </Button>
        </div>
      </div>
    )
  if (!session)
    return (
      <div className="space-y-4 rounded-panel border border-border bg-card p-6" role="status">
        <p className="text-sm text-muted-foreground">
          {t('roleManage.loadingBaseline', { defaultValue: '正在读取完整菜单定义与当前关联…' })}
        </p>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
        <Button variant="outline" onClick={onClose}>
          {t('roleManage.returnToGraph', { defaultValue: '返回图谱' })}
        </Button>
      </div>
    )

  const { catalog, draft } = session
  const candidates = rolePermissionCandidates(catalog, parentId, keyword)
  const pages = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  const visible = candidates.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const selected = selectedId ? catalog.byId.get(selectedId) : undefined
  const parent = parentId ? catalog.byId.get(parentId) : undefined
  const unresolved = unresolvedRolePermissionIds(catalog, draft)
  const unresolvedKept = unresolvedSelectedRolePermissionIds(catalog, draft)
  const selectedState = selected ? rolePermissionDraftState(draft, selected.id) : null
  const disabled = mutation.isPending || reviewing || result.isFetching || result.isError
  const navigate = (id: string | null, keyboard: boolean) => {
    restoreKeyboardFocus.current = keyboard && (id !== parentId || keyword !== '')
    setParentId(id)
    setSelectedId(id)
    setKeyword('')
    setPage(0)
  }
  const stateLabel = (state: RolePermissionDraftState) => {
    if (state === 'linked') return t('roleManage.linked', { defaultValue: '已关联' })
    if (state === 'added') return t('roleManage.pendingAdd', { defaultValue: '待添加' })
    if (state === 'removed') return t('roleManage.pendingRemove', { defaultValue: '待移除' })
    return t('roleManage.unlinked', { defaultValue: '未关联' })
  }

  return (
    <section
      className="role-menu-editor space-y-4"
      aria-label={t('roleManage.permissionEditor', { defaultValue: '构建角色授权关系' })}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-brand-text">
            <Link2 className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold">
              {t('roleManage.editRoleLinks', {
                defaultValue: '编辑「{{name}}」的授权关联',
                name: role.roleName,
              })}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t('roleManage.editLinkRules', {
                defaultValue: '添加本项时补齐上级；移除仅影响本项，已有上级与下级关联保持。',
              })}
            </p>
          </div>
        </div>
        <Button variant="outline" disabled={mutation.isPending} onClick={requestClose}>
          <ArrowLeft aria-hidden="true" />
          {t('roleManage.returnToGraph', { defaultValue: '返回图谱' })}
        </Button>
      </header>
      {(result.isError || saveError) && (
        <div
          className="flex items-start gap-3 rounded-xl border border-warning bg-card p-4"
          role="alert"
        >
          <AlertCircle
            className="mt-0.5 size-4 shrink-0 text-warning-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm">
              {saveError?.message ||
                (result.error instanceof ApiError
                  ? result.error.message
                  : t('roleManage.editorLoadFailed', { defaultValue: '授权编辑数据加载失败。' }))}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(conflict ? 'roleManage.conflictHint' : 'roleManage.saveFailureHint', {
                defaultValue: conflict
                  ? '服务端关联已变化，当前草稿仍保留。请重新载入基线后重新审阅。'
                  : '当前草稿未丢失；再次保存前会重新核对服务端基线。',
              })}
            </p>
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={requestReload}
            >
              {t('roleManage.reloadBaseline', { defaultValue: '重新载入基线' })}
            </Button>
          </div>
        </div>
      )}
      <div className="role-menu-editor-layout">
        <InsightCard className="min-w-0 overflow-hidden" motionEnabled={enabled}>
          <div className="space-y-3 border-b border-border-subtle p-4">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={keyword}
                  disabled={mutation.isPending}
                  className="pl-9 pr-10"
                  placeholder={t('roleManage.searchCandidates', {
                    defaultValue: '搜索菜单、操作或权限标识…',
                  })}
                  aria-label={t('roleManage.searchCandidates', {
                    defaultValue: '搜索菜单、操作或权限标识…',
                  })}
                  onChange={(event) => {
                    setKeyword(event.target.value)
                    setSelectedId(null)
                    setPage(0)
                  }}
                />
                {keyword && (
                  <Button
                    type="button"
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('roleManage.clearCandidateSearch', {
                      defaultValue: '清除候选搜索',
                    })}
                    onClick={() => {
                      setKeyword('')
                      setPage(0)
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {t('roleManage.candidatesCount', {
                  defaultValue: '{{count}} 个候选',
                  count: candidates.length,
                })}
              </span>
            </div>
            <nav
              className="flex flex-wrap items-center gap-1 text-xs"
              aria-label={t('roleManage.catalogPath', { defaultValue: '菜单定义层级' })}
            >
              <Button
                ref={!parent || keyword ? currentBreadcrumb : undefined}
                variant="ghost"
                size="xs"
                disabled={mutation.isPending}
                onClick={(event) => navigate(null, event.detail === 0)}
              >
                {t('roleManage.catalogRoot', { defaultValue: '全部定义' })}
              </Button>
              {!keyword &&
                parent?.pathIds.map((id, index) => (
                  <span key={id} className="flex min-w-0 items-center gap-1">
                    <ChevronRight
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <button
                      ref={id === parentId ? currentBreadcrumb : undefined}
                      type="button"
                      className="max-w-48 truncate rounded-control px-2 py-1 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(event) => navigate(id, event.detail === 0)}
                      title={parent.pathNames[index]}
                    >
                      {parent.pathNames[index]}
                    </button>
                  </span>
                ))}
            </nav>
          </div>
          {visible.length > 0 ? (
            presentation === 'list' ? (
              <ul className="divide-y divide-border p-4">
                {visible.map((node) => {
                  const linked = draft.selected.has(node.id)
                  return (
                    <li key={node.id} className="flex items-center gap-3 py-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setSelectedId(node.id)}
                        aria-pressed={selectedId === node.id}
                      >
                        <span className="block text-sm font-medium">{node.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {node.pathNames.join(' / ')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {stateLabel(rolePermissionDraftState(draft, node.id))}
                        </span>
                      </button>
                      {node.children.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => navigate(node.id, event.detail === 0)}
                        >
                          {t('roleManage.previousCatalogLevel', { defaultValue: '展开分支' })}
                        </Button>
                      )}
                      <Button
                        variant={linked ? 'ghost' : 'outline'}
                        size="sm"
                        disabled={disabled}
                        onClick={() => toggle(node)}
                      >
                        {t(linked ? 'authorization.remove' : 'authorization.add')}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div
                className="role-menu-editor-canvas"
                role="group"
                aria-label={t('roleManage.relationshipCanvas', {
                  defaultValue: '角色与候选菜单的关联图',
                })}
              >
                <svg
                  viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
                  className="absolute inset-0 size-full"
                  aria-hidden="true"
                >
                  {visible.map((node, index) => (
                    <DraftEdge
                      key={node.id}
                      y={
                        visible.length === 1
                          ? GRAPH.roleY
                          : 75 + (index / (visible.length - 1)) * 360
                      }
                      state={rolePermissionDraftState(draft, node.id)}
                      enabled={enabled}
                    />
                  ))}
                </svg>
                <button
                  type="button"
                  className="role-menu-editor-node flex items-center justify-center"
                  data-role="true"
                  style={{
                    width: `${(104 / GRAPH.width) * 100}%`,
                    left: `${(GRAPH.roleX / GRAPH.width) * 100}%`,
                    top: `${(GRAPH.roleY / GRAPH.height) * 100}%`,
                  }}
                  onClick={(event) => navigate(null, event.detail === 0)}
                  aria-label={t('roleManage.returnToRoleRoot', {
                    defaultValue: '返回角色关联总览',
                  })}
                >
                  <ShieldCheck className="size-8" strokeWidth={1.5} aria-hidden="true" />
                </button>
                <div
                  className="absolute text-center"
                  style={{ left: '4%', top: '64%', width: '31%' }}
                >
                  <p className="line-clamp-2 break-words text-sm font-semibold">{role.roleName}</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {t('roleManage.draftLinkCount', {
                      defaultValue: '草稿关联 {{count}} 项',
                      count: draft.selected.size,
                    })}
                  </p>
                </div>
                {visible.map((node, index) => (
                  <CandidateNode
                    key={node.id}
                    node={node}
                    y={
                      visible.length === 1 ? GRAPH.roleY : 75 + (index / (visible.length - 1)) * 360
                    }
                    state={rolePermissionDraftState(draft, node.id)}
                    selected={selectedId === node.id}
                    additions={rolePermissionAdditions(catalog, draft, node.id).length}
                    disabled={disabled}
                    enabled={enabled}
                    onSelect={() => setSelectedId(node.id)}
                    onExplore={(keyboard) => navigate(node.id, keyboard)}
                    onToggle={() => toggle(node)}
                  />
                ))}
              </div>
            )
          ) : (
            <div
              className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center"
              role="status"
            >
              <CircleHelp className="size-9 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">
                {t('roleManage.noCandidates', { defaultValue: '这里没有可展示的候选节点。' })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('roleManage.noCandidatesHint', {
                  defaultValue: '清除搜索或返回上一级继续构建关联。',
                })}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={(event) => navigate(parent?.pathIds.at(-2) ?? null, event.detail === 0)}
              >
                {t('roleManage.previousCatalogLevel', { defaultValue: '返回上一级' })}
              </Button>
            </div>
          )}
          <div className="space-y-4 border-t border-border-subtle p-4">
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
              {(['linked', 'unlinked', 'added', 'removed'] as const).map((state) => (
                <span
                  key={state}
                  className="role-menu-editor-state inline-flex items-center gap-1.5 text-muted-foreground"
                  data-state={state}
                >
                  {state === 'added' ? (
                    <Plus className="size-3" aria-hidden="true" />
                  ) : state === 'removed' ? (
                    <Unlink className="size-3" aria-hidden="true" />
                  ) : (
                    <span className="block w-4 border-t border-current" />
                  )}{' '}
                  {stateLabel(state)}
                </span>
              ))}
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={currentPage === 0 || mutation.isPending}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label={t('roleManage.previousCandidates', { defaultValue: '上一组候选' })}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {currentPage + 1} / {pages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={currentPage + 1 >= pages || mutation.isPending}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label={t('roleManage.nextCandidates', { defaultValue: '下一组候选' })}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            )}
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {t('roleManage.hierarchyReadOnly', {
                defaultValue: '目录层级仅用于导航，不会被修改。图中连线表示角色的直接关联。',
              })}
            </p>
          </div>
        </InsightCard>
        <div className="min-w-0 space-y-4">
          <InsightCard className="space-y-4 p-5" motionEnabled={enabled}>
            {reviewing ? (
              <>
                <h3 className="font-semibold">
                  {t('roleManage.reviewChanges', { defaultValue: '审阅关联变更' })}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('roleManage.reviewChangesHint', {
                    defaultValue: '只提交这些直接关联的增减；原目录定义与其他未修改关联保持。',
                  })}
                </p>
                <div className="max-h-96 space-y-4 overflow-y-auto">
                  {changes.added.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-brand-text">
                        {t('roleManage.addedCount', {
                          defaultValue: '新增 {{count}} 项',
                          count: changes.added.length,
                        })}
                      </h4>
                      <ChangeList
                        ids={changes.added}
                        state="added"
                        catalog={catalog}
                        disabled={mutation.isPending}
                        onUndo={undo}
                      />
                    </div>
                  )}
                  {changes.removed.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-destructive">
                        {t('roleManage.removedCount', {
                          defaultValue: '移除 {{count}} 项',
                          count: changes.removed.length,
                        })}
                      </h4>
                      <ChangeList
                        ids={changes.removed}
                        state="removed"
                        catalog={catalog}
                        disabled={mutation.isPending}
                        onUndo={undo}
                      />
                    </div>
                  )}
                  {!dirty && (
                    <p className="text-sm text-muted-foreground">
                      {t('roleManage.noLinkChanges', {
                        defaultValue: '当前没有待保存的关联变更。',
                      })}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="insight-eyebrow">
                  {t('roleManage.nodeInspector', { defaultValue: '节点检查器' })}
                </p>
                <h3 className="break-words font-semibold">
                  {selected?.name ??
                    t('roleManage.selectCandidate', { defaultValue: '选择一个候选节点' })}
                </h3>
                {selected && selectedState ? (
                  <>
                    <span
                      className="role-menu-editor-state inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                      data-state={selectedState}
                    >
                      {selectedState === 'added' ? (
                        <Plus className="size-3" />
                      ) : selectedState === 'removed' ? (
                        <Unlink className="size-3" />
                      ) : (
                        <Check className="size-3" />
                      )}
                      {stateLabel(selectedState)}
                    </span>
                    <p className="break-words text-xs leading-relaxed text-muted-foreground">
                      {selected.pathNames.join(' / ')}
                    </p>
                    <code className="block break-all rounded-control bg-muted p-3 text-xs">
                      {selected.path ||
                        t('roleManage.noPermissionCode', { defaultValue: '此节点没有权限标识' })}
                    </code>
                    <Button
                      className="w-full"
                      variant={draft.selected.has(selected.id) ? 'outline' : 'default'}
                      disabled={disabled}
                      onClick={() => toggle(selected)}
                    >
                      {draft.selected.has(selected.id) ? (
                        <>
                          <Unlink aria-hidden="true" />
                          {t('roleManage.removeLink', { defaultValue: '移除关联' })}
                        </>
                      ) : (
                        <>
                          <Plus aria-hidden="true" />
                          {t('roleManage.addLinksCount', {
                            defaultValue: '关联 +{{count}}',
                            count: rolePermissionAdditions(catalog, draft, selected.id).length,
                          })}
                        </>
                      )}
                    </Button>
                    {draft.selected.has(selected.id) && (
                      <p className="text-xs text-muted-foreground">
                        {t('roleManage.removeLinkHint', {
                          defaultValue: '移除当前关联，其他节点保持。',
                        })}
                      </p>
                    )}
                    {!draft.selected.has(selected.id) &&
                      rolePermissionAdditions(catalog, draft, selected.id).length > 1 && (
                        <p className="text-xs text-muted-foreground">
                          {t('roleManage.addAncestorsHint', {
                            defaultValue: '将一并补齐 {{count}} 项上级关联，不会添加其他下级节点。',
                            count: rolePermissionAdditions(catalog, draft, selected.id).length - 1,
                          })}
                        </p>
                      )}
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {selected.id}
                    </p>
                  </>
                ) : (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t('roleManage.selectCandidateHint', {
                      defaultValue: '点击圆形节点查看来源；用关联按钮添加或移除，用箭头探索下级。',
                    })}
                  </p>
                )}
              </>
            )}
          </InsightCard>
          {unresolved.length > 0 && (
            <InsightCard className="space-y-3 p-5" motionEnabled={enabled}>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <AlertCircle className="size-4 text-warning-foreground" aria-hidden="true" />
                {t('roleManage.unresolvedCount', {
                  defaultValue: '未解析关联 {{count}} 项',
                  count: unresolved.length,
                })}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('roleManage.unresolvedPreserved', {
                  defaultValue:
                    '原关联仍完整保留。只有明确移除才会从提交中删除；不会因定义不可见而自动过滤。',
                })}
              </p>
              {unresolvedKept.length > 0 && (
                <p className="text-xs leading-relaxed text-warning-foreground" role="status">
                  {t('roleManage.unresolvedSaveBlocked', {
                    defaultValue: '仍有 {{count}} 项关联无法验证。请明确移除这些关联后再审阅保存。',
                    count: unresolvedKept.length,
                  })}
                </p>
              )}
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {unresolved.map((id) => (
                  <li key={id} className="flex items-start gap-2 rounded-control bg-muted p-2">
                    <span className="min-w-0 flex-1">
                      <code className="block break-all text-xs">{id}</code>
                      <span
                        className="role-menu-editor-state mt-1 block text-xs"
                        data-state={rolePermissionDraftState(draft, id)}
                      >
                        {stateLabel(rolePermissionDraftState(draft, id))}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={disabled}
                      onClick={() =>
                        updateDraft((current) =>
                          current.draft.selected.has(id)
                            ? unlinkRolePermission(current.draft, id)
                            : undoRolePermissionChange(current.draft, id),
                        )
                      }
                      aria-label={
                        draft.selected.has(id)
                          ? t('roleManage.removeUnknownLink', {
                              defaultValue: '移除未解析关联 {{id}}',
                              id,
                            })
                          : t('roleManage.keepUnknownLink', {
                              defaultValue: '保留原关联 {{id}}',
                              id,
                            })
                      }
                    >
                      {draft.selected.has(id) ? (
                        <Unlink aria-hidden="true" />
                      ) : (
                        <RotateCcw aria-hidden="true" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </InsightCard>
          )}
        </div>
      </div>
      <div className="role-menu-editor-savebar flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium" aria-live="polite">
            {dirty
              ? t('roleManage.draftChangesCount', {
                  defaultValue: '未保存：新增 {{added}} 项，移除 {{removed}} 项',
                  added: changes.added.length,
                  removed: changes.removed.length,
                })
              : t('roleManage.noLinkChanges', { defaultValue: '当前没有待保存的关联变更。' })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('roleManage.originalAndDraftCount', {
              defaultValue: '原始 {{before}} 项 → 草稿 {{after}} 项',
              before: draft.baseline.size,
              after: draft.selected.size,
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            disabled={!dirty || mutation.isPending}
            onClick={() => {
              setSession((current) =>
                current ? { ...current, draft: resetRolePermissionDraft(current.draft) } : current,
              )
              setReviewing(false)
              if (!conflict) setSaveError(null)
            }}
          >
            <RotateCcw aria-hidden="true" />
            {t('roleManage.undoAllLinks', { defaultValue: '撤销全部变更' })}
          </Button>
          {reviewing ? (
            <>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => setReviewing(false)}
              >
                <ArrowLeft aria-hidden="true" />
                {t('roleManage.returnToEditing', { defaultValue: '返回修改' })}
              </Button>
              <Button
                disabled={
                  !dirty || conflict || mutation.isPending || result.isError || result.isFetching
                }
                onClick={() =>
                  mutation.mutate({
                    expectedRevision: session.revision,
                    baselineMenuIds: [...draft.baseline],
                    menuIds: [...draft.selected],
                  })
                }
              >
                <Save aria-hidden="true" />
                {mutation.isPending
                  ? t('roleManage.savingLinks', { defaultValue: '正在保存关联…' })
                  : t('roleManage.confirmSaveLinks', { defaultValue: '确认并保存关联' })}
              </Button>
            </>
          ) : (
            <Button
              disabled={!dirty || mutation.isPending || result.isError || result.isFetching}
              onClick={() => setReviewing(true)}
            >
              <Eye aria-hidden="true" />
              {t('roleManage.reviewChanges', { defaultValue: '审阅关联变更' })}
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <AlertDialog
        open={leaving !== null}
        onOpenChange={(open) => {
          if (!open) setLeaving(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('roleManage.discardLinkDraft', { defaultValue: '放弃未保存的关联变更？' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('roleManage.discardLinkDraftHint', {
                defaultValue: '这些变更尚未写入服务端。放弃后仍保留原来的角色关联。',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('roleManage.continueLinkEditing', { defaultValue: '继续编辑' })}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (leaving === 'reload') restart()
                else onClose()
              }}
            >
              {leaving === 'reload'
                ? t('roleManage.discardAndReload', { defaultValue: '放弃并重新载入' })
                : t('roleManage.discardAndReturn', { defaultValue: '放弃并返回' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
