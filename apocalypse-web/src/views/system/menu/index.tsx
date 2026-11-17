/**
 * 菜单管理（V2 A3/A4 树账本 + 检视器）：菜单树（目录/菜单/按钮）的增删改查。
 * 单行紧凑过滤工具栏 + 5 列清晰缩进树表 + 右侧 ResponsiveInspector 顶置 LivingContextBar。
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronsDownUp, ChevronsUpDown, Network, Plus, Rows3, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { Perm } from '@/components/Perm'
import { DynaQueryFeedback } from '@/components/dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { useEntityIntent } from '@/components/navigation'
import { ResponsiveInspector } from '@/components/spatial'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

import { MenuDeleteDialog } from './MenuDeleteDialog'
import { MenuFormDialog, type MenuFormPayload } from './MenuFormDialog'
import { MenuTreeTable } from './MenuTreeTable'
import { MenuInspector, MenuTreeWorkspace } from './MenuTreeWorkspace'
import { menuAncestorPath } from './menu-workspace.model'
import { getMenuTree } from './menu.api'
import {
  ROOT_PARENT_ID,
  collectSubtreeIds,
  normalizeMenuTreeNode,
  type MenuNode,
  type MenuType,
} from './menu.types'

const MENU_VIEWS = ['workspace', 'table'] as const

type MenuFilter = 'ALL' | MenuType

function flattenTree(nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)])
}

function filterTree(nodes: MenuNode[], query: string, type: MenuFilter): MenuNode[] {
  const keyword = query.trim().toLowerCase()
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query, type)
    const haystack = [node.menuName, node.path, node.component, node.perms, node.icon]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const matchesQuery = !keyword || haystack.includes(keyword)
    const matchesType = type === 'ALL' || node.menuType === type
    if ((matchesQuery && matchesType) || children.length > 0) return [{ ...node, children }]
    return []
  })
}

export default function MenuPage() {
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  return <MenuPageContent key={authorizationEpoch} />
}

function MenuPageContent() {
  const { t } = useTranslation()
  const { intent: menuIntent, clearPulse } = useEntityIntent('menu')
  const queryClient = useQueryClient()
  const desktop = useDesktopViewport()
  const [requestedView, setView] = usePageView(MENU_VIEWS, 'menuView')
  const view = desktop ? requestedView : 'workspace'
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tableInspectorOpen, setTableInspectorOpen] = useState(false)
  const [focusAfterSave, setFocusAfterSave] = useState<{ id: string; sequence: number }>()
  const [lastResult, setLastResult] = useState('')

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [formPayload, setFormPayload] = useState<MenuFormPayload | null>(null)
  const [deleting, setDeleting] = useState<MenuNode | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MenuFilter>('ALL')

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['system', 'menus', 'tree'],
    queryFn: getMenuTree,
  })
  useResourceDenial({
    errors: [error],
    clear: { queryKey: ['system', 'menus', 'tree'] },
    reset: () => {
      setFormPayload(null)
      setDeleting(null)
    },
  })
  const canShowTree = data !== undefined && !isResourceDenied(error)
  const tree = useMemo(
    () => (canShowTree ? data : [])?.map(normalizeMenuTreeNode) ?? [],
    [data, canShowTree],
  )
  const allNodes = useMemo(() => flattenTree(tree), [tree])
  const expandableIds = useMemo(
    () => allNodes.filter((node) => node.children.length > 0).map((node) => node.id),
    [allNodes],
  )
  const collapsed = useMemo(
    () => new Set(expandableIds.filter((id) => !expanded.has(id))),
    [expandableIds, expanded],
  )
  const filteredTree = useMemo(() => filterTree(tree, query, typeFilter), [tree, query, typeFilter])
  const filteredNodes = useMemo(() => flattenTree(filteredTree), [filteredTree])
  const filtering = query.trim().length > 0 || typeFilter !== 'ALL'
  const effectiveCollapsed = filtering ? new Set<string>() : collapsed

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system', 'menus'] })

  const toggle = (id: string, recursive = false) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      const target = allNodes.find((item) => item.id === id)
      const shouldExpand = !next.has(id)
      const ids =
        recursive && target
          ? [...collectSubtreeIds(target)].filter((subId) => expandableIds.includes(subId))
          : [id]
      for (const item of ids) {
        if (shouldExpand) next.add(item)
        else next.delete(item)
      }
      return next
    })
  }

  const collapseAll = () => setExpanded(new Set())

  const [params] = useSearchParams()
  const urlFocusMenuId = menuIntent?.focusTargetId ?? menuIntent?.id ?? params.get('menuId')
  const [seenUrlFocus, setSeenUrlFocus] = useState(urlFocusMenuId)
  if (seenUrlFocus !== urlFocusMenuId) {
    setSeenUrlFocus(urlFocusMenuId)
    setFocusAfterSave(undefined)
  }
  const focusMenuId =
    seenUrlFocus === urlFocusMenuId ? (focusAfterSave?.id ?? urlFocusMenuId) : urlFocusMenuId
  const [appliedFocus, setAppliedFocus] = useState<string | null>(null)
  const [appliedSequence, setAppliedSequence] = useState<number | undefined>()
  const focusTarget = focusMenuId ? allNodes.find((node) => node.id === focusMenuId) : undefined
  if (
    focusTarget &&
    (appliedFocus !== focusTarget.id || appliedSequence !== focusAfterSave?.sequence)
  ) {
    setSelectedId(focusTarget.id)
    setAppliedSequence(focusAfterSave?.sequence)
    const byId = new Map(allNodes.map((node) => [node.id, node]))
    const next = new Set(expanded)
    for (let parent = byId.get(focusTarget.parentId); parent; parent = byId.get(parent.parentId))
      next.add(parent.id)
    setAppliedFocus(focusTarget.id)
    setExpanded(next)
  }
  useEffect(() => {
    if (!appliedFocus) return
    const row = document.getElementById(
      `${view === 'workspace' ? 'menu-object' : 'menu-row'}-${appliedFocus}`,
    )
    row?.scrollIntoView({ block: 'center' })
    row?.focus({ preventScroll: true })
    if (menuIntent?.triggerPulse) clearPulse()
  }, [appliedFocus, appliedSequence, clearPulse, menuIntent?.triggerPulse, view])

  const selectNode = (id: string) => {
    setSelectedId(id)
    setExpanded(
      (current) => new Set([...current, ...menuAncestorPath(tree, id).map((node) => node.id)]),
    )
  }
  const effectiveSelectedId =
    selectedId && allNodes.some((node) => node.id === selectedId)
      ? selectedId
      : (tree[0]?.id ?? null)
  const selectedNode = effectiveSelectedId
    ? allNodes.find((node) => node.id === effectiveSelectedId)
    : undefined
  const selectedPath = effectiveSelectedId ? menuAncestorPath(tree, effectiveSelectedId) : []
  const selectedHasChildren = Boolean(selectedNode && selectedNode.children.length > 0)
  const selectedBranchExpanded = Boolean(selectedNode && expanded.has(selectedNode.id))

  return (
    <div className="w-full min-w-0 space-y-5 p-4 sm:p-6">
      <PageHeader
        title={t('common.菜单管理', { defaultValue: '菜单管理' })}
        view={
          desktop ? (
            <SegmentedControl
              label={t('system:menuWorkspace.view')}
              value={view}
              onChange={setView}
              options={[
                { value: 'workspace', label: t('system:menuWorkspace.workspace'), icon: Network },
                { value: 'table', label: t('system:menuWorkspace.table'), icon: Rows3 },
              ]}
            />
          ) : undefined
        }
        actions={
          <Perm perm="system:menu:add" requiresAllScope>
            <Button onClick={() => setFormPayload({ mode: 'create', parentId: ROOT_PARENT_ID })}>
              <Plus className="size-4" />
              {t('common.新增菜单', { defaultValue: '新增菜单' })}
            </Button>
          </Perm>
        }
      />

      {lastResult && (
        <p
          role="status"
          className="menu-result rounded-control border border-border-subtle bg-card px-3 py-2 text-sm"
          key={lastResult}
        >
          {lastResult}
        </p>
      )}
      <DynaQueryFeedback
        error={error}
        hasData={canShowTree}
        refreshing={isFetching}
        onRetry={() => void refetch()}
      />
      {(!error || canShowTree) && (
        <section
          className="overflow-hidden rounded-panel border border-border-subtle bg-card shadow-surface"
          aria-busy={isFetching}
        >
          {/* 单行紧凑过滤工具条 */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border-subtle bg-muted/20 px-4 py-2.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
              <div className="relative min-w-52 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="menu-search"
                  aria-label={t('dyna.querySearch')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('system:authorization.menuSearch')}
                  className="h-8 pl-9 text-xs"
                />
              </div>
              <div
                role="group"
                aria-label={t('common.菜单类型筛选', { defaultValue: '菜单类型筛选' })}
                className="flex items-center rounded-control bg-muted p-0.5"
              >
                {(
                  [
                    ['ALL', '全部'],
                    ['C', '目录'],
                    ['M', '菜单'],
                    ['F', '历史按钮'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={typeFilter === value}
                    onClick={() => setTypeFilter(value)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      typeFilter === value
                        ? 'bg-card font-medium text-foreground shadow-xs'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {value === 'F'
                      ? t('system:authorization.legacyButton')
                      : t(`dyna.${label}`, { defaultValue: label })}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {selectedNode && selectedHasChildren && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={filtering}
                  onClick={() => toggle(selectedNode.id, true)}
                >
                  <ChevronsUpDown className="size-4" />
                  {selectedBranchExpanded
                    ? t('common.折叠当前分支', { defaultValue: '折叠当前分支' })
                    : t('common.展开当前分支', { defaultValue: '展开当前分支' })}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={filtering}
                onClick={() => setExpanded(new Set(expandableIds))}
              >
                <ChevronsUpDown className="size-4" />
                {t('common.全部展开', { defaultValue: '全部展开' })}
              </Button>
              <Button variant="ghost" size="sm" disabled={filtering} onClick={collapseAll}>
                <ChevronsDownUp className="size-4" />
                {t('common.全部折叠', { defaultValue: '全部折叠' })}
              </Button>
              {canShowTree && (
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                  {t('common.显示 {{visible}} / {{total}} 个菜单节点', {
                    defaultValue: '显示 {{visible}} / {{total}} 个菜单节点',
                    visible: filteredNodes.length,
                    total: allNodes.length,
                  })}
                </span>
              )}
            </div>
          </div>

          {view === 'workspace' ? (
            <MenuTreeWorkspace
              tree={filteredTree}
              allTree={tree}
              collapsed={effectiveCollapsed}
              selectedId={effectiveSelectedId}
              loading={isLoading}
              filtering={filtering}
              source={menuIntent?.source}
              onSelect={selectNode}
              onToggle={toggle}
              onResetFilters={() => {
                setQuery('')
                setTypeFilter('ALL')
              }}
              onCreateChild={(node) => setFormPayload({ mode: 'create', parentId: node.id })}
              onEdit={(node) => setFormPayload({ mode: 'edit', node })}
              onDelete={setDeleting}
            />
          ) : (
            <div className="menu-workspace p-4">
              <div className="menu-workspace-grid">
                <div className="min-w-0 overflow-hidden rounded-control border border-border-subtle">
                  <MenuTreeTable
                    tree={filteredTree}
                    isLoading={isLoading}
                    collapsed={effectiveCollapsed}
                    onToggle={toggle}
                    onSelect={(id) => {
                      selectNode(id)
                      setTableInspectorOpen(true)
                    }}
                    highlightId={effectiveSelectedId}
                    onCreateChild={(node) => setFormPayload({ mode: 'create', parentId: node.id })}
                    onEdit={(node) => setFormPayload({ mode: 'edit', node })}
                    onDelete={setDeleting}
                    filtering={filtering}
                    onResetFilters={() => {
                      setQuery('')
                      setTypeFilter('ALL')
                    }}
                  />
                </div>
                <ResponsiveInspector
                  title={t('system:menuWorkspace.details')}
                  context={selectedNode?.menuName}
                  open={tableInspectorOpen}
                  onOpenChange={setTableInspectorOpen}
                  mode="auto"
                  className="menu-workspace-aside min-w-0"
                >
                  <MenuInspector
                    node={selectedNode}
                    path={selectedPath}
                    source={menuIntent?.source}
                    onSelect={selectNode}
                    onCreateChild={(node) => setFormPayload({ mode: 'create', parentId: node.id })}
                    onEdit={(node) => setFormPayload({ mode: 'edit', node })}
                    onDelete={setDeleting}
                  />
                </ResponsiveInspector>
              </div>
            </div>
          )}
        </section>
      )}

      <MenuFormDialog
        open={formPayload !== null}
        payload={formPayload ?? { mode: 'create', parentId: ROOT_PARENT_ID }}
        tree={tree}
        onOpenChange={(open) => !open && setFormPayload(null)}
        onRefresh={() => void invalidate()}
        onSaved={(id, name) => {
          setQuery('')
          setTypeFilter('ALL')
          setFocusAfterSave((current) => ({ id, sequence: (current?.sequence ?? 0) + 1 }))
          setLastResult(t('system:menuWorkspace.saved', { name }))
          void invalidate()
        }}
      />

      <MenuDeleteDialog
        node={deleting}
        onClose={() => setDeleting(null)}
        onRefresh={() => void invalidate()}
        onDeleted={(node) => {
          const id =
            node.parentId !== ROOT_PARENT_ID
              ? node.parentId
              : (tree.find((item) => item.id !== node.id)?.id ?? '')
          setSelectedId(id || null)
          setFocusAfterSave((current) => ({ id, sequence: (current?.sequence ?? 0) + 1 }))
          setLastResult(t('system:menuWorkspace.deleted', { name: node.menuName }))
          void invalidate()
        }}
      />
    </div>
  )
}
