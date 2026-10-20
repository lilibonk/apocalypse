/**
 * 部门组织图（桌面）：组织图与树表是同一部门管理的两种完整方式，共用查询、表单与写操作。
 * 选择部门后根至目标的祖先路径点亮并一次性脉冲；侧栏同步资料与成员（遵守 system:user:list 数据范围）。
 */
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  LocateFixed,
  Maximize2,
  PanelRightOpen,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { DictTag } from '@/components/DictTag'
import { Perm } from '@/components/Perm'
import { PathPulse } from '@/components/insights/graph/PathPulse'
import { ZoomPanCanvas, type ZoomPanCanvasHandle } from '@/components/insights/graph/ZoomPanCanvas'
import '@/components/insights/graph/graph.css'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api/client'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

import { pageDeptMembers } from './dept-members.api'
import {
  ancestorPath,
  chartGeometry,
  defaultExpanded,
  findNode,
  layoutTree,
  nextFocus,
} from './dept-chart.model'
import type { DeptTreeNode, SnowflakeId } from './types'
import './dept-chart.css'

const MEMBER_PAGE = 20

export function DeptOrgChart({
  tree,
  onCreateChild,
  onEdit,
  onDelete,
  focusRequest,
  active = true,
}: {
  focusRequest?: { id: string; sequence: number }
  active?: boolean
  tree: readonly DeptTreeNode[]
  onCreateChild: (parentId: SnowflakeId) => void
  onEdit: (node: DeptTreeNode) => void
  onDelete: (node: DeptTreeNode) => void
}) {
  const { t } = useTranslation('system')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => defaultExpanded(tree, 2))
  const [selected, setSelected] = useState<string | null>(tree[0]?.id ?? null)
  const [focusId, setFocusId] = useState<string | null>(tree[0]?.id ?? null)
  const [pulse, setPulse] = useState(0)
  const canvas = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<ZoomPanCanvasHandle>(null)
  const [wide, setWide] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [overviewRequest, setOverviewRequest] = useState(0)
  const appliedOverviewRequest = useRef(0)
  const [appliedRequest, setAppliedRequest] = useState<number | null>(null)
  if (focusRequest && appliedRequest !== focusRequest.sequence && findNode(tree, focusRequest.id)) {
    setAppliedRequest(focusRequest.sequence)
    setSelected(focusRequest.id)
    setFocusId(focusRequest.id)
    setExpanded(new Set([...expanded, ...ancestorPath(tree, focusRequest.id)]))
    setPulse((value) => value + 1)
  }
  if (selected && !findNode(tree, selected)) {
    setSelected(tree[0]?.id ?? null)
    setFocusId(tree[0]?.id ?? null)
  }
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => {
      if (element.clientWidth)
        setWide(
          element.clientWidth >=
            60 * parseFloat(getComputedStyle(document.documentElement).fontSize),
        )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [tree.length])
  const layout = useMemo(() => layoutTree(tree, expanded), [tree, expanded])
  useLayoutEffect(() => {
    if (overviewRequest !== appliedOverviewRequest.current) {
      appliedOverviewRequest.current = overviewRequest
      viewport.current?.overview()
    }
  }, [overviewRequest, layout])
  const selectedNode = selected ? findNode(tree, selected) : null
  const path = useMemo(
    () => new Set(selected ? ancestorPath(tree, selected) : []),
    [tree, selected],
  )
  const select = (id: string) => {
    setSelected(id)
    setFocusId(id)
    setPulse((value) => value + 1)
  }
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!focusId || !(event.target as HTMLElement).closest('[data-dept]')) return
    const item = layout.nodes.find((entry) => entry.node.id === focusId)
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(focusId)
      return
    }
    if (item?.hasChildren && (event.key === '+' || (event.key === 'ArrowDown' && !item.expanded))) {
      event.preventDefault()
      if (!item.expanded) toggle(focusId)
      return
    }
    if (item?.expanded && event.key === '-') {
      event.preventDefault()
      toggle(focusId)
      return
    }
    const next = nextFocus(layout, focusId, event.key)
    if (!next) return
    event.preventDefault()
    setFocusId(next)
    canvas.current?.querySelector<HTMLElement>(`[data-dept="${next}"]`)?.focus()
  }
  const { nodeWidth, nodeHeight } = chartGeometry
  const revealed = layout.nodes.find((item) => item.node.id === (focusId ?? selected))
  const revealBox = revealed
    ? { x: revealed.x, y: revealed.y, width: nodeWidth, height: nodeHeight }
    : null
  const selectedBox = layout.nodes.find((item) => item.node.id === selected)
  const details = (
    <DeptSidePanel
      node={selectedNode}
      path={
        selected ? ancestorPath(tree, selected).map((id) => findNode(tree, id)?.deptName ?? id) : []
      }
      onCreateChild={onCreateChild}
      onEdit={onEdit}
      onDelete={onDelete}
      active={active && (wide || detailsOpen)}
    />
  )
  return (
    <div ref={root} className={cn('dept-chart grid gap-4', wide && 'dept-chart-wide')}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-panel border border-border-subtle bg-card p-3 dept-chart-context">
        <div className="min-w-0 text-sm">
          <p className="font-medium break-words">{selectedNode?.deptName ?? t('deptChart.pick')}</p>
          {selected && (
            <p className="mt-1 text-xs break-words text-muted-foreground">
              {ancestorPath(tree, selected)
                .map((id) => findNode(tree, id)?.deptName ?? id)
                .join(' / ')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setExpanded(defaultExpanded(tree, Number.POSITIVE_INFINITY))
              setOverviewRequest((value) => value + 1)
            }}
          >
            <Maximize2 aria-hidden="true" />
            {t('deptChart.overview')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedNode}
            onClick={() => {
              if (selected && !selectedBox) {
                setExpanded(new Set([...expanded, ...ancestorPath(tree, selected)]))
                setFocusId(selected)
              }
              if (selectedBox)
                viewport.current?.centerOn(
                  {
                    x: selectedBox.x,
                    y: selectedBox.y,
                    width: nodeWidth,
                    height: nodeHeight,
                  },
                  0.8,
                )
            }}
          >
            <LocateFixed aria-hidden="true" />
            {t('deptChart.locate')}
          </Button>
          {!wide && (
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedNode}
              onClick={() => setDetailsOpen(true)}
            >
              <PanelRightOpen aria-hidden="true" />
              {t('deptChart.details')}
            </Button>
          )}
        </div>
      </div>
      <div ref={canvas} role="tree" aria-label={t('deptChart.tree')} onKeyDown={onKeyDown}>
        <ZoomPanCanvas
          ref={viewport}
          fitLabel={t('deptChart.readableScale')}
          width={layout.width}
          height={layout.height}
          label={t('deptChart.canvas')}
          fitKey={`${tree.length}:${expanded.size}:${active}`}
          minFitScale={0.8}
          reveal={revealBox}
        >
          <svg
            width={layout.width}
            height={layout.height}
            className="absolute inset-0 overflow-visible"
            aria-hidden="true"
          >
            {layout.edges.map((edge) => (
              <PathPulse
                key={`${edge.from}-${edge.to}`}
                d={edge.d}
                active={path.has(edge.from) && path.has(edge.to)}
                pulseKey={pulse}
              />
            ))}
          </svg>
          {layout.nodes.map((item) => {
            const node = item.node
            const onPath = path.has(node.id)
            return (
              <div
                key={node.id}
                className="dept-node"
                data-selected={selected === node.id || undefined}
                data-path={onPath || undefined}
                data-disabled={node.status !== 1 || undefined}
                style={{ left: item.x, top: item.y, width: nodeWidth, height: nodeHeight }}
              >
                <button
                  type="button"
                  role="treeitem"
                  data-dept={node.id}
                  tabIndex={focusId === node.id ? 0 : -1}
                  aria-level={item.depth + 1}
                  aria-selected={selected === node.id}
                  aria-expanded={item.hasChildren ? item.expanded : undefined}
                  className="dept-node-main"
                  onFocus={() => setFocusId(node.id)}
                  onClick={() => select(node.id)}
                >
                  <span className="block truncate font-medium">{node.deptName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {node.leader ?? t('deptChart.noLeader')}
                    {node.status !== 1 && ` · ${t('deptChart.disabled')}`}
                  </span>
                </button>
                {item.hasChildren && (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="dept-node-toggle"
                    aria-label={t(item.expanded ? 'deptChart.collapse' : 'deptChart.expand', {
                      name: node.deptName,
                    })}
                    onClick={() => toggle(node.id)}
                  >
                    {item.expanded ? (
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                    ) : (
                      <span className="flex items-center gap-0.5 text-xs">
                        {node.children?.length}
                        <ChevronRight className="size-3" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </ZoomPanCanvas>
        <p className="mt-2 text-xs text-muted-foreground">{t('deptChart.keyboard')}</p>
      </div>
      {wide ? (
        details
      ) : (
        <Sheet open={detailsOpen && active} onOpenChange={setDetailsOpen}>
          <SheetContent aria-describedby={undefined}>
            <SheetHeader>
              <SheetTitle>
                {t('deptChart.details')} · {selectedNode?.deptName}
              </SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4">{details}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

function DeptSidePanel({
  active,
  node,
  path,
  onCreateChild,
  onEdit,
  onDelete,
}: {
  active: boolean
  node: DeptTreeNode | null
  path: string[]
  onCreateChild: (parentId: SnowflakeId) => void
  onEdit: (node: DeptTreeNode) => void
  onDelete: (node: DeptTreeNode) => void
}) {
  const { t } = useTranslation('system')
  if (!node)
    return (
      <aside className="dept-panel rounded-panel p-4 text-sm text-muted-foreground">
        {t('deptChart.pick')}
      </aside>
    )
  return (
    <aside
      aria-labelledby="dept-panel-title"
      className="dept-panel space-y-4 rounded-panel p-4 text-sm"
    >
      <div>
        <p className="text-xs break-words text-muted-foreground">{path.join(' / ')}</p>
        <h2 id="dept-panel-title" className="mt-1 text-lg font-semibold break-words">
          {node.deptName}
        </h2>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t('deptChart.leader')}</dt>
          <dd className="mt-1 break-words">{node.leader ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('deptChart.phone')}</dt>
          <dd className="mt-1 break-all">{node.phone ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('deptChart.status')}</dt>
          <dd className="mt-1">
            <DictTag type="sys_user_status" value={String(node.status)} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('deptChart.children')}</dt>
          <dd className="mt-1 tabular-nums">{node.children?.length ?? 0}</dd>
        </div>
        {node.remark && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">{t('deptChart.remark')}</dt>
            <dd className="mt-1 break-words">{node.remark}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Perm perm="system:dept:add" requiresAllScope>
          <Button size="sm" variant="outline" onClick={() => onCreateChild(node.id)}>
            <Plus aria-hidden="true" />
            {t('deptChart.addChild')}
          </Button>
        </Perm>
        <Perm perm="system:dept:edit" requiresAllScope>
          <Button size="sm" variant="outline" onClick={() => onEdit(node)}>
            <Pencil aria-hidden="true" />
            {t('deptChart.edit')}
          </Button>
        </Perm>
        <Perm perm="system:dept:remove" requiresAllScope>
          <Button size="sm" variant="outline" onClick={() => onDelete(node)}>
            <Trash2 aria-hidden="true" />
            {t('deptChart.delete')}
          </Button>
        </Perm>
      </div>
      <DeptMembers deptId={node.id} key={node.id} active={active} />
    </aside>
  )
}

function DeptMembers({ deptId, active }: { deptId: SnowflakeId; active: boolean }) {
  const { t } = useTranslation('system')
  const canList = useAuthStore((state) => state.perms.includes('system:user:list'))
  const epoch = useAuthStore((state) => state.sessionEpoch)
  const [includeChildren, setIncludeChildren] = useState(false)
  const [page, setPage] = useState(1)
  const members = useQuery({
    queryKey: ['system', 'depts', 'members', epoch, deptId, includeChildren, page],
    queryFn: ({ signal }) => pageDeptMembers(deptId, includeChildren, page, MEMBER_PAGE, signal),
    enabled: canList && active,
  })
  useResourceDenial({
    errors: [members.error],
    clear: { queryKey: ['system', 'depts', 'members'] },
    reset: () => setPage(1),
  })
  const pages = members.data ? Math.max(1, Math.ceil(members.data.total / MEMBER_PAGE)) : 1
  return (
    <section
      aria-labelledby="dept-members-title"
      className="space-y-3 border-t border-border-subtle pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="dept-members-title" className="flex items-center gap-2 font-medium">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          {members.data
            ? t('deptChart.membersCount', { count: members.data.total })
            : t('deptChart.members')}
        </h3>
        {canList && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={includeChildren}
              onCheckedChange={(value) => {
                setIncludeChildren(value)
                setPage(1)
              }}
            />
            {t('deptChart.includeChildren')}
          </label>
        )}
      </div>
      {!canList && <p className="text-xs text-muted-foreground">{t('deptChart.membersDenied')}</p>}
      {canList && members.isPending && <Skeleton className="h-20 w-full" />}
      {canList && members.isError && (
        <div role="alert" className="flex items-center gap-2 rounded-control bg-muted p-2 text-xs">
          <span className="flex-1">
            {members.error instanceof ApiError
              ? members.error.message
              : t('deptChart.membersFailed')}
          </span>
          <Button size="xs" variant="outline" onClick={() => void members.refetch()}>
            {t('deptChart.retry')}
          </Button>
        </div>
      )}
      {members.data && members.data.list.length === 0 && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('deptChart.noMembers')}
        </p>
      )}
      {members.data && members.data.list.length > 0 && (
        <ul className="space-y-1.5">
          {members.data.list.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{member.nickname || member.username}</span>
              <span
                className={cn(
                  'min-w-0 truncate text-xs text-muted-foreground',
                  member.status !== 1 && 'line-through',
                )}
              >
                {member.deptName ?? member.username}
              </span>
            </li>
          ))}
        </ul>
      )}
      {members.data && pages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Button size="xs" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t('deptChart.previous')}
          </Button>
          <span className="tabular-nums">
            {page} / {pages}
          </span>
          <Button
            size="xs"
            variant="ghost"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t('deptChart.next')}
          </Button>
        </div>
      )}
    </section>
  )
}
