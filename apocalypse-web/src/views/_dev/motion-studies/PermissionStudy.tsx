/**
 * Development-only relationship explorer. This graph and its coordinated detail
 * panel exceed a CRUD schema; every permission below is explicitly local sample data.
 */
import { useEffect, useId, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  Eye,
  Fingerprint,
  GitBranch,
  Info,
  List,
  Network,
  PenLine,
  Plus,
  RotateCcw,
  ScanEye,
  Search,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'

import { studyMotion } from '@/design/motion'

import {
  derivePermissionStudy,
  initialPermissionState,
  permissionRoles,
  selectPermissionGroup,
  selectPermissionRole,
  selectStudyPermission,
  studyPermissions,
  type PermissionAction,
  type PermissionGroupId,
  type PermissionRoleId,
  type PermissionStudyState,
  type StudyLanguage,
} from './permission-model'
import './permission-study.css'
import { useStudyAnimation } from './useStudyAnimation'

interface PermissionStudyProps {
  language: StudyLanguage
  motionEnabled: boolean
}

const copy = {
  zh: {
    eyebrow: '02 / ACCESS EXPLORER',
    title: '权限有迹可循。',
    subtitle: '从一个角色出发，看清每一项操作的来源。',
    sample: '本地示例',
    selectRole: '选择角色',
    permissions: '项权限',
    search: '搜索当前角色的权限',
    placeholder: '搜索操作、菜单或权限标识…',
    clear: '清除搜索',
    graph: '图谱',
    list: '列表',
    view: '查看方式',
    reset: '重置视图',
    role: '角色',
    menu: '菜单分组',
    action: '操作权限',
    explore: '选择分组，展开操作',
    matched: '项匹配',
    currentRole: '当前角色',
    directGrant: '直接授权',
    selected: '已选中',
    expand: '展开',
    collapse: '收起',
    inspect: '查看权限',
    focus: '查看角色总览',
    summary: '授权摘要',
    available: '可访问的示例权限',
    groups: '个菜单分组',
    source: '授权来源',
    details: '权限明细',
    all: '全部权限',
    emptyTitle: '没有匹配的权限',
    emptyBody: '试试操作名称、菜单名称或权限标识。搜索只包含当前示例角色已获授的权限。',
    clearFilters: '清除筛选',
    exampleNote: '此图使用本地示例数据，不代表当前账号权限；操作不会修改任何真实授权。',
    mobileHint: '窄屏使用等价列表，保留完整权限与来源。',
    path: '来源路径',
    selectedRelation: '当前关联',
    otherRelation: '其他关联',
    overview: '角色总览',
    granted: '已获授',
  },
  en: {
    eyebrow: '02 / ACCESS EXPLORER',
    title: 'Every permission, connected.',
    subtitle: 'Start with a role. Follow every action back to its source.',
    sample: 'Local examples',
    selectRole: 'Select role',
    permissions: 'permissions',
    search: 'Search permissions for this role',
    placeholder: 'Search actions, menus or permission IDs…',
    clear: 'Clear search',
    graph: 'Graph',
    list: 'List',
    view: 'View mode',
    reset: 'Reset view',
    role: 'ROLE',
    menu: 'MENU GROUP',
    action: 'PERMISSION',
    explore: 'Choose a group to explore its actions',
    matched: 'matches',
    currentRole: 'Current role',
    directGrant: 'Direct grant',
    selected: 'Selected',
    expand: 'Expand',
    collapse: 'Collapse',
    inspect: 'Inspect permission',
    focus: 'Show role overview',
    summary: 'Access summary',
    available: 'Available example permissions',
    groups: 'menu groups',
    source: 'Granted through',
    details: 'Permission details',
    all: 'All permissions',
    emptyTitle: 'No matching permissions',
    emptyBody:
      'Try an action, a menu name or a permission ID. Search includes only the permissions granted to this example role.',
    clearFilters: 'Clear filters',
    exampleNote:
      'Local sample data, not your account permissions. These controls never change real access.',
    mobileHint: 'The compact list keeps every permission and source available.',
    path: 'Source path',
    selectedRelation: 'Selected path',
    otherRelation: 'Other paths',
    overview: 'Role overview',
    granted: 'Granted',
  },
} as const

const roleIcons: Record<PermissionRoleId, LucideIcon> = {
  administrator: Crown,
  operator: UserRoundCog,
  auditor: ScanEye,
}
const groupIcons: Record<PermissionGroupId, LucideIcon> = {
  members: UsersRound,
  access: ShieldCheck,
  calendar: CalendarDays,
}
const actionIcons: Record<PermissionAction, LucideIcon> = {
  read: Eye,
  create: Plus,
  update: PenLine,
  export: ArrowDownToLine,
}

const GRAPH = { width: 840, height: 560, centerY: 280 }
type Point = { x: number; y: number }

function curve(from: Point, to: Point) {
  const distance = (to.x - from.x) / 2
  return `M ${from.x} ${from.y} C ${from.x + distance} ${from.y}, ${to.x - distance} ${to.y}, ${to.x} ${to.y}`
}

function spread(index: number, count: number, start: number, end: number) {
  return count < 2 ? (start + end) / 2 : start + (index / (count - 1)) * (end - start)
}

function GraphEdge({
  from,
  to,
  active,
  action = false,
  index = 0,
  motionEnabled,
}: {
  from: Point
  to: Point
  active: boolean
  action?: boolean
  index?: number
  motionEnabled: boolean
}) {
  const target = { d: curve(from, to), pathLength: 1 }
  const controls = useStudyAnimation(
    target,
    motionEnabled,
    action ? { ...studyMotion.chart, delay: studyMotion.stagger * index } : studyMotion.layout,
  )
  return (
    <motion.path
      className={`permission-edge${action ? ' permission-action-edge' : ''}`}
      data-active={active}
      initial={action && motionEnabled ? { ...target, pathLength: 0 } : target}
      animate={controls}
    />
  )
}

function DialTicks({
  point,
  radius,
  motionEnabled,
}: {
  point: Point
  radius: number
  motionEnabled: boolean
}) {
  const target = { x: point.x, y: point.y }
  const controls = useStudyAnimation(target, motionEnabled, studyMotion.layout)
  return (
    <motion.g className="permission-dial-ticks" initial={target} animate={controls}>
      {Array.from({ length: 36 }, (_, index) => {
        const angle = (index / 36) * Math.PI * 2
        const inner = radius + (index % 3 === 0 ? 7 : 10)
        const outer = radius + 14
        return (
          <line
            key={index}
            x1={Math.cos(angle) * inner}
            y1={Math.sin(angle) * inner}
            x2={Math.cos(angle) * outer}
            y2={Math.sin(angle) * outer}
          />
        )
      })}
    </motion.g>
  )
}

function GraphNode({
  point,
  radius,
  icon: Icon,
  label,
  subtitle,
  ariaLabel,
  kind,
  active,
  dimmed = false,
  expanded,
  motionEnabled,
  onClick,
}: {
  point: Point
  radius: number
  icon: LucideIcon
  label: string
  subtitle: string
  ariaLabel: string
  kind: 'role' | 'group' | 'action'
  active: boolean
  dimmed?: boolean
  expanded?: boolean
  motionEnabled: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const target = {
    left: `${(point.x / GRAPH.width) * 100}%`,
    top: `${(point.y / GRAPH.height) * 100}%`,
    opacity: dimmed ? 0.45 : 1,
    y: motionEnabled && hovered ? -studyMotion.hoverLift : 0,
  }
  const controls = useStudyAnimation(target, motionEnabled, studyMotion.layout)
  return (
    <motion.button
      type="button"
      className={`permission-node permission-node-${kind}`}
      data-active={active}
      data-dimmed={dimmed}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      aria-pressed={expanded === undefined ? active : undefined}
      style={{ width: `${((radius * 2) / GRAPH.width) * 100}%` }}
      initial={
        motionEnabled && kind === 'action'
          ? {
              ...target,
              opacity: 0,
              y: studyMotion.enterOffset,
            }
          : target
      }
      animate={controls}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onClick}
    >
      <span className="permission-node-circle">
        <Icon
          aria-hidden="true"
          className={kind === 'role' ? 'size-8' : 'size-5'}
          strokeWidth={1.5}
        />
        {active && kind !== 'role' && (
          <span className="permission-node-check">
            <Check aria-hidden="true" className="size-2.5" />
          </span>
        )}
      </span>
      <span className="permission-node-label">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </motion.button>
  )
}

export function PermissionStudy({ language, motionEnabled }: PermissionStudyProps) {
  const t = copy[language]
  const [state, setState] = useState<PermissionStudyState>(initialPermissionState)
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [narrow, setNarrow] = useState(() => !window.matchMedia('(min-width: 768px)').matches)
  const searchId = useId()
  const model = derivePermissionStudy(state)
  const RoleIcon = roleIcons[model.role.id]
  const GroupIcon = model.activeGroup ? groupIcons[model.activeGroup.id] : Fingerprint
  const SelectedIcon = model.activePermission
    ? actionIcons[model.activePermission.action]
    : GroupIcon
  const showGraph = view === 'graph' && !narrow
  const noResults = model.hasQuery && model.matching.length === 0
  const rolePoint = { x: model.activeGroup ? 155 : 270, y: GRAPH.centerY }
  const groupPoints = new Map(
    model.groups.map((group, index) => [
      group.id,
      {
        x: model.activeGroup ? 405 : 565,
        y: model.activeGroup
          ? group.id === model.activeGroup.id
            ? GRAPH.centerY
            : model.groups.length === 2
              ? 110
              : spread(
                  model.groups
                    .filter((entry) => entry.id !== model.activeGroup?.id)
                    .findIndex((entry) => entry.id === group.id),
                  model.groups.length - 1,
                  110,
                  450,
                )
          : spread(index, model.groups.length, 115, 445),
      },
    ]),
  )
  const displayedPermissions = model.activeGroup ? model.activePermissions : model.matching

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const handleChange = () => setNarrow(!media.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const chooseGroup = (groupId: PermissionGroupId) => {
    setState((current) =>
      selectPermissionGroup({ ...current, groupId: model.activeGroup?.id ?? null }, groupId),
    )
  }

  return (
    <section className="permission-study space-y-6" aria-label={t.title}>
      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={t.selectRole}>
        {permissionRoles.map((role) => {
          const Icon = roleIcons[role.id]
          const selected = state.roleId === role.id
          return (
            <button
              key={role.id}
              type="button"
              className="permission-role-choice flex min-w-0 items-center gap-3 rounded-2xl border p-4 text-left"
              data-active={selected}
              aria-pressed={selected}
              aria-label={`${t.selectRole}: ${role.label[language]}`}
              onClick={() => setState(selectPermissionRole(role.id))}
            >
              <span className="permission-role-icon flex size-11 shrink-0 items-center justify-center rounded-xl">
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{role.label[language]}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {role.permissionIds.length} {t.permissions}
                </span>
              </span>
              {selected ? (
                <Check aria-hidden="true" className="permission-role-marker size-4 shrink-0" />
              ) : (
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="permission-workspace grid min-w-0 gap-5">
        <div className="study-card min-w-0 overflow-hidden">
          <h2 className="sr-only">{t.graph}</h2>
          <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4 sm:p-5">
            <div className="permission-search relative min-w-0 flex-1 basis-64">
              <label htmlFor={searchId} className="sr-only">
                {t.search}
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id={searchId}
                type="search"
                value={state.query}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    query: event.target.value,
                    permissionId: null,
                  }))
                }
                placeholder={t.placeholder}
                className="h-11 w-full rounded-xl border border-border bg-background py-2 pr-10 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoComplete="off"
              />
              {state.query && (
                <button
                  type="button"
                  aria-label={t.clear}
                  onClick={() =>
                    setState((current) => ({ ...current, query: '', permissionId: null }))
                  }
                  className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-xl text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>
            <div
              className="permission-view-control flex rounded-xl p-1"
              role="group"
              aria-label={t.view}
            >
              {!narrow && (
                <button
                  type="button"
                  aria-pressed={showGraph}
                  onClick={() => setView('graph')}
                  className="permission-view-button inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium"
                >
                  <Network aria-hidden="true" className="size-3.5" />
                  {t.graph}
                </button>
              )}
              <button
                type="button"
                aria-pressed={!showGraph}
                onClick={() => setView('list')}
                className="permission-view-button inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium"
              >
                <List aria-hidden="true" className="size-3.5" />
                {t.list}
              </button>
            </div>
            <button
              type="button"
              aria-label={t.reset}
              title={t.reset}
              onClick={() => {
                setState(selectPermissionRole(state.roleId))
                setView('graph')
              }}
              className="permission-reset flex size-11 items-center justify-center rounded-xl border border-border text-muted-foreground"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
            </button>
          </div>

          <div
            className="flex items-center justify-between gap-3 px-5 pt-5 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="permission-live-dot size-1.5 shrink-0 rounded-full" />
              {model.role.label[language]}
              <span aria-hidden="true">/</span>
              {model.groups.length} {t.groups}
            </span>
            {model.hasQuery && (
              <span className="shrink-0 tabular-nums">
                {model.matching.length} {t.matched}
              </span>
            )}
          </div>

          {noResults ? (
            <div
              className="permission-empty flex flex-col items-center justify-center gap-4 p-8 text-center"
              role="status"
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Search aria-hidden="true" className="size-6" strokeWidth={1.5} />
              </span>
              <div>
                <h3 className="text-base font-semibold">{t.emptyTitle}</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t.emptyBody}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setState((current) => ({ ...current, query: '' }))}
                className="permission-clear rounded-xl border border-border px-4 py-2 text-sm font-medium"
              >
                {t.clearFilters}
              </button>
            </div>
          ) : showGraph ? (
            <div className="permission-graph-frame px-2 pb-3 sm:px-4">
              <div
                className="permission-graph-labels grid grid-cols-3 pt-6 text-center text-xs font-medium text-muted-foreground"
                aria-hidden="true"
              >
                <span>{t.role}</span>
                <span>{t.menu}</span>
                <span>{model.activeGroup ? t.action : ''}</span>
              </div>
              <div
                className="permission-graph relative"
                role="group"
                aria-label={`${model.role.label[language]} — ${t.graph}`}
              >
                <svg
                  className="absolute inset-0 size-full overflow-visible"
                  viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
                  fill="none"
                  aria-hidden="true"
                >
                  {model.groups.map((group) => {
                    const point = groupPoints.get(group.id)!
                    const active = model.activeGroup?.id === group.id
                    return (
                      <GraphEdge
                        key={`edge-${group.id}`}
                        from={rolePoint}
                        to={point}
                        active={active}
                        motionEnabled={motionEnabled}
                      />
                    )
                  })}
                  {model.activeGroup &&
                    model.activePermissions.map((permission, index) => {
                      const point = {
                        x: 692,
                        y: spread(index, model.activePermissions.length, 105, 445),
                      }
                      return (
                        <GraphEdge
                          key={`edge-${permission.id}`}
                          from={groupPoints.get(model.activeGroup!.id)!}
                          to={point}
                          active={
                            !model.activePermission || model.activePermission.id === permission.id
                          }
                          action
                          index={index}
                          motionEnabled={motionEnabled}
                        />
                      )
                    })}
                  <DialTicks point={rolePoint} radius={56} motionEnabled={motionEnabled} />
                  {model.activeGroup && (
                    <DialTicks
                      point={groupPoints.get(model.activeGroup.id)!}
                      radius={36}
                      motionEnabled={motionEnabled}
                    />
                  )}
                </svg>
                <GraphNode
                  point={rolePoint}
                  radius={56}
                  icon={RoleIcon}
                  label={model.role.label[language]}
                  subtitle={`${model.granted.length} ${t.permissions}`}
                  ariaLabel={`${t.focus}: ${model.role.label[language]}`}
                  kind="role"
                  active={!model.activeGroup}
                  motionEnabled={motionEnabled}
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      groupId: null,
                      permissionId: null,
                      query: '',
                    }))
                  }
                />
                {model.groups.map((group) => (
                  <GraphNode
                    key={group.id}
                    point={groupPoints.get(group.id)!}
                    radius={36}
                    icon={groupIcons[group.id]}
                    label={group.label[language]}
                    subtitle={`${group.permissions.length} ${t.permissions}`}
                    ariaLabel={`${model.activeGroup?.id === group.id ? t.collapse : t.expand}: ${group.label[language]}`}
                    kind="group"
                    active={model.activeGroup?.id === group.id}
                    dimmed={model.hasQuery && group.matches.length === 0}
                    expanded={model.activeGroup?.id === group.id}
                    motionEnabled={motionEnabled}
                    onClick={() => chooseGroup(group.id)}
                  />
                ))}
                {model.activePermissions.map((permission, index) => (
                  <GraphNode
                    key={permission.id}
                    point={{ x: 692, y: spread(index, model.activePermissions.length, 105, 445) }}
                    radius={25}
                    icon={actionIcons[permission.action]}
                    label={permission.label[language]}
                    subtitle={
                      model.activePermission?.id === permission.id ? t.selected : t.directGrant
                    }
                    ariaLabel={`${t.inspect}: ${permission.label[language]}`}
                    kind="action"
                    active={model.activePermission?.id === permission.id}
                    motionEnabled={motionEnabled}
                    onClick={() =>
                      setState((current) => selectStudyPermission(current, permission))
                    }
                  />
                ))}
                {!model.activeGroup && (
                  <p className="absolute inset-x-0 bottom-2 text-center text-xs text-muted-foreground">
                    {t.explore}
                  </p>
                )}
              </div>
              <div
                className="flex items-center justify-center gap-6 pb-3 text-xs text-muted-foreground"
                aria-hidden="true"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="permission-legend-selected block h-px w-5" />
                  {t.selectedRelation}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="permission-legend-other block h-px w-5" />
                  {t.otherRelation}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4 sm:p-5">
              {narrow && (
                <p className="pb-1 text-xs leading-relaxed text-muted-foreground">{t.mobileHint}</p>
              )}
              {model.groups
                .filter((group) => !model.hasQuery || group.matches.length > 0)
                .map((group) => {
                  const Icon = groupIcons[group.id]
                  const open = model.activeGroup?.id === group.id
                  const permissions = model.hasQuery ? group.matches : group.permissions
                  return (
                    <div
                      className="permission-list-group overflow-hidden rounded-2xl border border-border"
                      key={group.id}
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => chooseGroup(group.id)}
                        className="flex w-full items-center gap-3 p-4 text-left"
                      >
                        <span className="permission-list-icon flex size-10 shrink-0 items-center justify-center rounded-xl">
                          <Icon aria-hidden="true" className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {group.label[language]}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {permissions.length} {t.permissions}
                          </span>
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-4 shrink-0 text-muted-foreground ${open ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {open && (
                        <div className="space-y-1 border-t border-border-subtle p-2">
                          {permissions.map((permission) => {
                            const Icon = actionIcons[permission.action]
                            return (
                              <button
                                type="button"
                                key={permission.id}
                                aria-pressed={model.activePermission?.id === permission.id}
                                onClick={() =>
                                  setState((current) => selectStudyPermission(current, permission))
                                }
                                className="permission-list-action flex w-full items-center gap-3 rounded-xl p-3 text-left"
                              >
                                <Icon
                                  aria-hidden="true"
                                  className="size-4 shrink-0 text-muted-foreground"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm">
                                    {permission.label[language]}
                                  </span>
                                  <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                                    {permission.id}
                                  </span>
                                </span>
                                <ChevronRight
                                  aria-hidden="true"
                                  className="size-4 shrink-0 text-muted-foreground"
                                />
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )}
          <div className="flex items-start gap-2 border-t border-border-subtle px-5 py-4 text-xs leading-relaxed text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <p>{t.exampleNote}</p>
          </div>
        </div>

        <aside
          className="study-card permission-summary min-w-0 self-start overflow-hidden"
          aria-label={t.summary}
        >
          <div className="permission-summary-header p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-medium text-muted-foreground">{t.summary}</h2>
              <Fingerprint
                aria-hidden="true"
                className="permission-summary-mark size-5"
                strokeWidth={1.5}
              />
            </div>
            <div className="mt-6 flex items-end gap-2">
              <span className="permission-summary-number text-6xl font-medium tracking-tighter tabular-nums">
                {model.granted.length.toString().padStart(2, '0')}
              </span>
              <span className="pb-2 text-sm text-muted-foreground">
                / {studyPermissions.length}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t.available}</p>
            <div className="permission-coverage mt-5 grid grid-cols-12 gap-1" aria-hidden="true">
              {studyPermissions.map((permission) => (
                <span
                  key={permission.id}
                  className="h-1.5 rounded-full"
                  data-granted={model.role.permissionIds.includes(permission.id)}
                />
              ))}
            </div>
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground">{t.path}</p>
              <ol className="permission-source-path space-y-3">
                {model.path.map((label, index) => (
                  <li key={`${index}-${label.en}`} className="flex items-center gap-3 text-sm">
                    <span className="permission-path-index flex size-5 shrink-0 items-center justify-center rounded-full text-xs">
                      {index + 1}
                    </span>
                    <span
                      className={
                        index === model.path.length - 1 ? 'font-medium' : 'text-muted-foreground'
                      }
                    >
                      {label[language]}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="permission-selection rounded-2xl border p-4" aria-live="polite">
              <span className="permission-selection-icon mb-3 flex size-9 items-center justify-center rounded-xl">
                <SelectedIcon aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </span>
              <h3 className="text-sm font-semibold">
                {model.activePermission?.label[language] ??
                  model.activeGroup?.label[language] ??
                  model.role.label[language]}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {model.activePermission?.description[language] ??
                  model.activeGroup?.description[language] ??
                  model.role.description[language]}
              </p>
              <span className="permission-grant-label mt-3 inline-flex items-center gap-1.5 text-xs font-medium">
                <Check aria-hidden="true" className="size-3" />
                {t.directGrant}
              </span>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{t.details}</h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {displayedPermissions.length}
                </span>
              </div>
              {displayedPermissions.length ? (
                <ul className="permission-detail-list space-y-1">
                  {displayedPermissions.map((permission) => (
                    <li key={permission.id}>
                      <button
                        type="button"
                        className="permission-detail-button flex w-full items-start gap-2 rounded-xl p-2 text-left"
                        aria-pressed={model.activePermission?.id === permission.id}
                        onClick={() =>
                          setState((current) => selectStudyPermission(current, permission))
                        }
                      >
                        <span className="permission-detail-dot mt-1.5 size-1 shrink-0 rounded-full" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium">
                            {permission.label[language]}
                          </span>
                          <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                            {permission.id}
                          </span>
                        </span>
                        {model.activePermission?.id === permission.id && (
                          <ArrowRight aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">{t.emptyTitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-border-subtle pt-4 text-xs text-muted-foreground">
              <GitBranch aria-hidden="true" className="size-3.5 shrink-0" />
              {t.source}
              <span className="ml-auto min-w-0 text-right font-medium text-foreground">
                {t.role}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
