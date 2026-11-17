/**
 * 部门组织图（桌面全幅空间画布舞台 + 顶左搜索定位 HUD + 右侧一体检视器 HUD）：
 * 组织图与树表是同一部门管理的两种完整方式，共用查询、表单与写操作。
 * 选择部门后根至目标的祖先路径点亮并触发一次性金色脉冲；右侧检视器最顶部挂载 LivingContextBar
 * 统一承载上级部门与「部门成员 N 人 → 用户管理」EntityPill，下方展示纯文本成员预览。
 */
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  LocateFixed,
  Maximize2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { DictTag } from '@/components/DictTag'
import { Perm } from '@/components/Perm'
import { ZoomPanCanvas, type ZoomPanCanvasHandle } from '@/components/insights/graph/ZoomPanCanvas'
import '@/components/insights/graph/graph.css'
import { PathPulse } from '@/components/motion'
import {
  EntityPeekLink,
  LivingContextBar,
  useEntityIntent,
  type EntitySourceRef,
} from '@/components/navigation'
import { FloatingHud, SpatialStage } from '@/components/spatial'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ApiError } from '@/lib/api/client'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

import {
  ancestorPath,
  chartGeometry,
  defaultExpanded,
  findNode,
  layoutTree,
  nextFocus,
} from './dept-chart.model'
import './dept-chart.css'
import { pageDeptMembers } from './dept-members.api'
import { flattenDeptTree } from './tree-utils'
import type { DeptTreeNode, SnowflakeId } from './types'

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
  const { intent: deptIntent, clearPulse } = useEntityIntent('dept')
  const canListUsers = useAuthStore((state) => state.perms.includes('system:user:list'))
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => defaultExpanded(tree, 2))
  const [selected, setSelected] = useState<string | null>(tree[0]?.id ?? null)
  const [focusId, setFocusId] = useState<string | null>(tree[0]?.id ?? null)
  const [pulse, setPulse] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [includeChildren, setIncludeChildren] = useState(false)
  const [memberPage, setMemberPage] = useState(1)
  const canvas = useRef<HTMLDivElement>(null)
  const viewport = useRef<ZoomPanCanvasHandle>(null)
  const [overviewRequest, setOverviewRequest] = useState(0)
  const appliedOverviewRequest = useRef(0)
  const [appliedRequest, setAppliedRequest] = useState<number | null>(null)
  const [appliedIntentId, setAppliedIntentId] = useState<string | null>(null)

  if (focusRequest && appliedRequest !== focusRequest.sequence && findNode(tree, focusRequest.id)) {
    setAppliedRequest(focusRequest.sequence)
    setSelected(focusRequest.id)
    setFocusId(focusRequest.id)
    setExpanded(new Set([...expanded, ...ancestorPath(tree, focusRequest.id)]))
    setPulse((value) => value + 1)
  }

  const intentTargetId = deptIntent?.focusTargetId ?? deptIntent?.id ?? null
  if (intentTargetId && appliedIntentId !== intentTargetId && findNode(tree, intentTargetId)) {
    setAppliedIntentId(intentTargetId)
    setSelected(intentTargetId)
    setFocusId(intentTargetId)
    setExpanded(new Set([...expanded, ...ancestorPath(tree, intentTargetId)]))
    setPulse((value) => value + 1)
  }

  useEffect(() => {
    if (deptIntent?.triggerPulse && appliedIntentId) {
      clearPulse()
    }
  }, [appliedIntentId, clearPulse, deptIntent?.triggerPulse])

  if (selected && !findNode(tree, selected)) {
    setSelected(tree[0]?.id ?? null)
    setFocusId(tree[0]?.id ?? null)
  }

  const layout = useMemo(() => layoutTree(tree, expanded), [tree, expanded])
  useLayoutEffect(() => {
    if (overviewRequest !== appliedOverviewRequest.current) {
      appliedOverviewRequest.current = overviewRequest
      viewport.current?.overview()
    }
  }, [overviewRequest, layout])

  const selectedNode = selected ? findNode(tree, selected) : null
  const ancestorIds = useMemo(
    () => (selected ? ancestorPath(tree, selected) : []),
    [tree, selected],
  )
  const parentNode = useMemo(() => {
    if (ancestorIds.length < 2) return null
    const parentId = ancestorIds[ancestorIds.length - 2]
    return parentId ? findNode(tree, parentId) : null
  }, [ancestorIds, tree])
  const path = useMemo(() => new Set(ancestorIds), [ancestorIds])

  const membersQuery = useQuery({
    queryKey: [
      'system',
      'depts',
      'members',
      sessionEpoch,
      selectedNode?.id ?? '',
      includeChildren,
      memberPage,
    ],
    queryFn: ({ signal }) =>
      pageDeptMembers(selectedNode!.id, includeChildren, memberPage, MEMBER_PAGE, signal),
    enabled: canListUsers && active && Boolean(selectedNode),
  })
  useResourceDenial({
    errors: [membersQuery.error],
    clear: { queryKey: ['system', 'depts', 'members'] },
    reset: () => setMemberPage(1),
  })

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return flattenDeptTree(tree as DeptTreeNode[], new Set())
      .map((row) => row.node)
      .filter(
        (node) =>
          node.deptName.toLowerCase().includes(q) ||
          (node.leader && node.leader.toLowerCase().includes(q)),
      )
      .slice(0, 6)
  }, [tree, searchQuery])

  const select = (id: string) => {
    setSelected(id)
    setFocusId(id)
    setMemberPage(1)
    setExpanded((current) => new Set([...current, ...ancestorPath(tree, id)]))
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

  const hud = (
    <>
      <FloatingHud
        slot="top-left"
        ariaLabel={t('deptChart.overview')}
        className="w-72 space-y-2 p-2.5 sm:w-80"
      >
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('deptChart.pick')}
              aria-label={t('deptChart.pick')}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs"
            onClick={() => {
              setExpanded(defaultExpanded(tree, Number.POSITIVE_INFINITY))
              setOverviewRequest((value) => value + 1)
            }}
          >
            <Maximize2 className="size-3.5" aria-hidden="true" />
            {t('deptChart.overview')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs"
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
            <LocateFixed className="size-3.5" aria-hidden="true" />
            {t('deptChart.locate')}
          </Button>
        </div>
        {searchMatches.length > 0 && (
          <ul className="max-h-36 divide-y divide-border-subtle overflow-y-auto rounded-control border border-border-subtle bg-background/90 text-xs">
            {searchMatches.map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    select(match.id)
                    setSearchQuery('')
                  }}
                >
                  <span className="truncate font-medium">{match.deptName}</span>
                  <span className="truncate text-muted-foreground">
                    {match.leader ?? t('deptChart.noLeader')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </FloatingHud>

      <FloatingHud
        slot="right-inspector"
        ariaLabel={t('deptChart.details')}
        className="sketch-surface space-y-4 p-4 text-sm"
      >
        {deptIntent?.source && <LivingContextBar source={deptIntent.source} />}

        <DeptIdentityHud
          tree={tree}
          node={selectedNode}
          parentNode={parentNode}
          ancestorIds={ancestorIds}
          onSelect={select}
          onCreateChild={onCreateChild}
          onEdit={onEdit}
          onDelete={onDelete}
        />

        {selectedNode && (
          <div className="border-t border-border-subtle pt-3">
            <DeptMembers
              sourceRef={{ kind: 'dept', id: selectedNode.id, label: selectedNode.deptName }}
              canList={canListUsers}
              includeChildren={includeChildren}
              onIncludeChildrenChange={(value) => {
                setIncludeChildren(value)
                setMemberPage(1)
              }}
              page={memberPage}
              onPageChange={setMemberPage}
              members={membersQuery}
            />
          </div>
        )}
      </FloatingHud>
    </>
  )

  return (
    <div className="dept-chart" data-theme-stage="">
      <SpatialStage backdrop="dots" minHeight="36rem" hud={hud}>
        <div
          ref={canvas}
          role="tree"
          aria-label={t('deptChart.tree')}
          onKeyDown={onKeyDown}
          className="size-full"
        >
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
              {layout.edges.map((edge) => {
                const isEdgeActive = path.has(edge.from) && path.has(edge.to)
                return (
                  <g key={`${edge.from}-${edge.to}`}>
                    <path
                      d={edge.d}
                      fill="none"
                      stroke={isEdgeActive ? 'var(--conduit-shadow)' : 'var(--border-subtle)'}
                      strokeWidth={isEdgeActive ? 10 : 2.5}
                      strokeLinecap="round"
                      className={isEdgeActive ? 'opacity-80' : 'opacity-60'}
                    />
                    {isEdgeActive && (
                      <path
                        d={edge.d}
                        fill="none"
                        stroke="var(--conduit-core)"
                        strokeWidth={3.2}
                        strokeLinecap="round"
                      />
                    )}
                    <PathPulse d={edge.d} tone="gold" active={isEdgeActive} pulseKey={pulse} />
                  </g>
                )
              })}
            </svg>
            {layout.nodes.map((item) => {
              const node = item.node
              const onPath = path.has(node.id)
              const childCount = node.children?.length ?? 0
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
                    <span className="block text-sm leading-snug font-medium text-foreground">
                      {node.deptName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
                      {node.leader ?? t('deptChart.noLeader')} ·{' '}
                      {t('deptChart.childrenCount', { count: childCount })}
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
                        <span className="flex items-center gap-0.5 text-xs tabular-nums">
                          {childCount}
                          <ChevronRight className="size-3" aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          </ZoomPanCanvas>
        </div>
      </SpatialStage>
    </div>
  )
}

function DeptIdentityHud({
  tree,
  node,
  parentNode,
  ancestorIds,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
}: {
  tree: readonly DeptTreeNode[]
  node: DeptTreeNode | null
  parentNode: DeptTreeNode | null
  ancestorIds: string[]
  onSelect: (id: string) => void
  onCreateChild: (parentId: SnowflakeId) => void
  onEdit: (node: DeptTreeNode) => void
  onDelete: (node: DeptTreeNode) => void
}) {
  const { t } = useTranslation('system')
  if (!node) return <p className="text-sm text-muted-foreground">{t('deptChart.pick')}</p>
  return (
    <div className="space-y-3">
      <div>
        <nav
          aria-label={t('deptChart.tree')}
          className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          {ancestorIds.map((id, index) => {
            const ancestor = findNode(tree, id)
            return (
              <span key={id} className="inline-flex items-center gap-1">
                {index > 0 && <ChevronRight className="size-3 shrink-0" aria-hidden="true" />}
                <button
                  type="button"
                  className="max-w-44 truncate rounded-sm px-1 py-0.5 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => onSelect(id)}
                >
                  {ancestor?.deptName ?? id}
                </button>
              </span>
            )
          })}
        </nav>
        <h2 id="dept-panel-title" className="mt-1 break-words text-base font-semibold">
          {node.deptName}
        </h2>
        {parentNode && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>↑</span>
            <EntityPeekLink
              kind="dept"
              id={parentNode.id}
              label={parentNode.deptName}
              source={{ kind: 'dept', id: node.id, label: node.deptName }}
              onNavigate={() => onSelect(parentNode.id)}
              className="text-xs"
            />
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-2.5 text-xs">
        <div>
          <dt className="text-muted-foreground">{t('deptChart.leader')}</dt>
          <dd className="mt-0.5 break-words font-medium">{node.leader ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('deptChart.phone')}</dt>
          <dd className="mt-0.5 break-all font-mono">{node.phone ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('deptChart.status')}</dt>
          <dd className="mt-0.5">
            <DictTag type="sys_user_status" value={String(node.status)} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('deptChart.children')}</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{node.children?.length ?? 0}</dd>
        </div>
        {node.remark && (
          <div className="col-span-2">
            <dt className="text-muted-foreground">{t('deptChart.remark')}</dt>
            <dd className="mt-0.5 break-words">{node.remark}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Perm perm="system:dept:add" requiresAllScope>
          <Button size="xs" variant="outline" onClick={() => onCreateChild(node.id)}>
            <Plus aria-hidden="true" />
            {t('deptChart.addChild')}
          </Button>
        </Perm>
        <Perm perm="system:dept:edit" requiresAllScope>
          <Button size="xs" variant="outline" onClick={() => onEdit(node)}>
            <Pencil aria-hidden="true" />
            {t('deptChart.edit')}
          </Button>
        </Perm>
        <Perm perm="system:dept:remove" requiresAllScope>
          <Button size="xs" variant="outline" onClick={() => onDelete(node)}>
            <Trash2 aria-hidden="true" />
            {t('deptChart.delete')}
          </Button>
        </Perm>
      </div>
    </div>
  )
}

function DeptMembers({
  sourceRef,
  canList,
  includeChildren,
  onIncludeChildrenChange,
  page,
  onPageChange,
  members,
}: {
  sourceRef: EntitySourceRef
  canList: boolean
  includeChildren: boolean
  onIncludeChildrenChange: (value: boolean) => void
  page: number
  onPageChange: (page: number) => void
  members: ReturnType<typeof useQuery<Awaited<ReturnType<typeof pageDeptMembers>>>>
}) {
  const { t } = useTranslation('system')
  const pages = members.data ? Math.max(1, Math.ceil(members.data.total / MEMBER_PAGE)) : 1
  return (
    <section aria-labelledby="dept-members-title" className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="dept-members-title" className="flex items-center gap-2 text-xs font-semibold">
          <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {members.data
            ? t('deptChart.membersCount', { count: members.data.total })
            : t('deptChart.members')}
        </h3>
        {canList && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={includeChildren} onCheckedChange={onIncludeChildrenChange} />
            {t('deptChart.includeChildren')}
          </label>
        )}
      </div>
      {!canList && <p className="text-xs text-muted-foreground">{t('deptChart.membersDenied')}</p>}
      {canList && members.isPending && <Skeleton className="h-16 w-full" />}
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
        <ul className="divide-y divide-border-subtle/60 text-xs">
          {members.data.list.map((member) => (
            <li
              key={member.id}
              className={cn(
                'flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0',
                member.status !== 1 && 'opacity-70',
              )}
            >
              <EntityPeekLink
                kind="user"
                id={String(member.id)}
                label={member.nickname || member.username}
                sublabel={`@${member.username}`}
                source={sourceRef}
              />
              <span className="truncate font-mono text-muted-foreground">@{member.username}</span>
            </li>
          ))}
        </ul>
      )}
      {members.data && pages > 1 && (
        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
          <Button
            size="xs"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {t('deptChart.previous')}
          </Button>
          <span className="tabular-nums">
            {page} / {pages}
          </span>
          <Button
            size="xs"
            variant="ghost"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            {t('deptChart.next')}
          </Button>
        </div>
      )}
    </section>
  )
}
