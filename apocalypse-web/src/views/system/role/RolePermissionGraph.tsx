import { useLayoutEffect, useRef, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight, KeyRound, ShieldCheck, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'

import {
  ROLE_GRAPH_BRANCH_SIZE,
  rolePermissionPage,
  type RolePermissionModel,
  type RolePermissionTarget,
} from './role-permission.model'
import { permissionNodeIcons } from './role-permission.icons'

const VIEW = { width: 820, height: 550 }
type Point = { x: number; y: number }

function Edge({
  from,
  to,
  direct,
  enabled,
}: {
  from: Point
  to: Point
  direct: boolean
  enabled: boolean
}) {
  const middle = (from.x + to.x) / 2
  const target = {
    d: `M ${from.x} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x} ${to.y}`,
  }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  return (
    <motion.path
      initial={target}
      animate={controls}
      className="role-graph-edge"
      data-direct={direct}
    />
  )
}

function Ticks({ point, radius, enabled }: { point: Point; radius: number; enabled: boolean }) {
  const target = { x: point.x, y: point.y }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  return (
    <motion.g initial={target} animate={controls} className="role-graph-ticks">
      {Array.from({ length: 36 }, (_, index) => {
        const angle = (index / 36) * Math.PI * 2
        const inner = radius + (index % 3 === 0 ? 8 : 12)
        const outer = radius + 16
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

function Node({
  point,
  radius,
  label,
  description,
  icon: Icon,
  direct,
  role = false,
  active,
  enabled,
  ariaLabel,
  onClick,
  buttonRef,
}: {
  point: Point
  radius: number
  label: string
  description: string
  icon: LucideIcon
  direct: boolean
  role?: boolean
  active: boolean
  enabled: boolean
  ariaLabel: string
  onClick: (keyboard: boolean) => void
  buttonRef?: Ref<HTMLButtonElement>
}) {
  const [hovered, setHovered] = useState(false)
  const target = {
    left: `${(point.x / VIEW.width) * 100}%`,
    top: `${(point.y / VIEW.height) * 100}%`,
    y: enabled && hovered ? -insightMotion.hoverLift : 0,
  }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  return (
    <motion.button
      ref={buttonRef}
      type="button"
      className="role-graph-node"
      data-direct={direct}
      data-role={role}
      data-active={active}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={label}
      style={{ width: `${((radius * 2) / VIEW.width) * 100}%` }}
      initial={target}
      animate={controls}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={(event) => onClick(event.detail === 0)}
    >
      <span className="role-graph-node-circle">
        <Icon aria-hidden="true" className={active ? 'size-7' : 'size-5'} strokeWidth={1.5} />
      </span>
      <span className="role-graph-node-label">
        <span className={`${active ? 'line-clamp-2' : 'block truncate'} text-sm font-medium`}>
          {label}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
    </motion.button>
  )
}

export function RoleGraphPagination({
  page,
  pages,
  onPage,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
}) {
  const { t } = useTranslation('system')
  if (pages < 2) return null
  return (
    <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('roleGraph.previous')}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="tabular-nums">{t('roleGraph.page', { page: page + 1, pages })}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('roleGraph.next')}
        disabled={page + 1 >= pages}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}

/** A bounded neighborhood of the real hierarchy. Pagination never discards the remaining nodes. */
export function RolePermissionGraph({
  model,
  role,
  selectedId,
  onSelect,
  branchPage,
  onBranchPage,
}: {
  model: RolePermissionModel
  role: RolePermissionTarget
  selectedId: string | null
  onSelect: (id: string | null) => void
  branchPage: number
  onBranchPage: (page: number) => void
}) {
  const { t } = useTranslation('system')
  const enabled = useMotionPreference()
  const centerButton = useRef<HTMLButtonElement>(null)
  const restoreKeyboardFocus = useRef(false)
  useLayoutEffect(() => {
    if (!restoreKeyboardFocus.current) return
    const frame = requestAnimationFrame(() => {
      if (!restoreKeyboardFocus.current) return
      restoreKeyboardFocus.current = false
      centerButton.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedId])
  const navigate = (id: string | null, keyboard: boolean) => {
    restoreKeyboardFocus.current = keyboard && id !== selectedId
    onSelect(id)
  }
  const selected = selectedId ? model.byId.get(selectedId) : undefined
  const parent = selected?.pathIds.at(-2) ? model.byId.get(selected.pathIds.at(-2)!) : undefined
  const children = selected ? selected.children : model.roots
  const branch = rolePermissionPage(children, branchPage, ROLE_GRAPH_BRANCH_SIZE)
  const center = { x: selected ? 365 : 180, y: 265 }
  const source = { x: 110, y: 265 }
  const points = branch.items.map((id, index) => ({
    id,
    point: {
      x: selected ? 655 : 575,
      y: branch.items.length === 1 ? 265 : 85 + (index / (branch.items.length - 1)) * 350,
    },
  }))
  const hasRoute = selected?.path !== null && selected?.path !== '' && selected?.path !== undefined

  return (
    <div className="role-permission-visual">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 text-xs text-muted-foreground">
        <span>{t('roleGraph.nextLevel')}</span>
        <span>{t('roleGraph.branchCount', { count: children.length })}</span>
      </div>
      <div
        className="role-permission-canvas relative mx-3"
        role="group"
        aria-label={t('roleGraph.graph')}
      >
        <svg
          className="absolute inset-0 size-full"
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          fill="none"
          aria-hidden="true"
        >
          {selected && (
            <Edge from={source} to={center} direct={selected.assigned} enabled={enabled} />
          )}
          {points.map(({ id, point }) => (
            <Edge
              key={id}
              from={center}
              to={point}
              direct={model.byId.get(id)!.assigned}
              enabled={enabled}
            />
          ))}
          {selected && children.length === 0 && hasRoute && (
            <Edge from={center} to={{ x: 630, y: 265 }} direct enabled={enabled} />
          )}
          <Ticks point={center} radius={selected ? 44 : 56} enabled={enabled} />
        </svg>
        {selected && (
          <Node
            point={source}
            radius={32}
            label={parent?.name ?? role.roleName}
            description={parent ? t(`roleGraph.${parent.type}`) : t('roleGraph.configured')}
            icon={parent ? permissionNodeIcons[parent.type] : ShieldCheck}
            direct={parent?.assigned ?? true}
            role={!parent}
            active={false}
            enabled={enabled}
            ariaLabel={t('roleGraph.returnTo', { name: parent?.name ?? role.roleName })}
            onClick={(keyboard) => navigate(parent?.id ?? null, keyboard)}
          />
        )}
        <Node
          buttonRef={centerButton}
          point={center}
          radius={selected ? 44 : 56}
          label={selected?.name ?? role.roleName}
          description={
            selected
              ? t(selected.assigned ? 'roleGraph.direct' : 'roleGraph.context')
              : `${model.assignedCount} · ${t('roleGraph.assignments')}`
          }
          icon={selected ? permissionNodeIcons[selected.type] : ShieldCheck}
          direct={selected?.assigned ?? true}
          role={!selected}
          active
          enabled={enabled}
          ariaLabel={
            selected ? t('roleGraph.inspect', { name: selected.name }) : t('roleGraph.reset')
          }
          onClick={(keyboard) => navigate(selected?.id ?? null, keyboard)}
        />
        {points.map(({ id, point }) => {
          const node = model.byId.get(id)!
          return (
            <Node
              key={id}
              point={point}
              radius={28}
              label={node.name}
              description={t(node.assigned ? 'roleGraph.direct' : 'roleGraph.context')}
              icon={permissionNodeIcons[node.type]}
              direct={node.assigned}
              active={false}
              enabled={enabled}
              ariaLabel={t('roleGraph.inspect', { name: node.name })}
              onClick={(keyboard) => navigate(node.id, keyboard)}
            />
          )
        })}
        {selected && children.length === 0 && (
          <div className="role-graph-leaf absolute rounded-2xl border p-4">
            <KeyRound aria-hidden="true" className="mb-3 size-5" />
            <p className="text-xs text-muted-foreground">
              {t(hasRoute ? 'roleGraph.identifier' : 'roleGraph.leaf')}
            </p>
            {hasRoute ? (
              <code className="mt-2 block break-all font-mono text-sm">{selected.path}</code>
            ) : (
              <p className="mt-2 text-sm">{t('roleGraph.noIdentifier')}</p>
            )}
          </div>
        )}
      </div>
      <div className="space-y-4 px-5 pb-5">
        <RoleGraphPagination page={branch.page} pages={branch.pageCount} onPage={onBranchPage} />
        <div
          className="flex flex-wrap justify-center gap-5 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          <span className="inline-flex items-center gap-2">
            <span className="role-graph-legend-direct h-px w-5" />
            {t('roleGraph.direct')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="role-graph-legend-context w-5 border-t border-dashed" />
            {t('roleGraph.context')}
          </span>
        </div>
      </div>
    </div>
  )
}
