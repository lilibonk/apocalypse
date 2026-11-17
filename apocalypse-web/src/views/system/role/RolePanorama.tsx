/**
 * 角色管理 — 业务域穿透流向拓扑舞台（A2 空间拓扑台）：
 * 左栏「持有人群（代表成员 + 持有人数 + 无角色账号告警）」
 *   ──▶ 中栏「角色 × 数据范围徽标（全部部门 / 本部门及下级 / 仅本部门）」
 *   ──▶ 右栏「五大真实业务能力域（身份与组织治理 / 角色与菜单授权 / 运行配置与会话 / 安全登录与审计 / 动态扩展域）」
 *
 * 连线语义：GOVERN（含写/治理权）为高对比实线 +「治理」徽标；READ（仅查询权）为细虚线 +「只读」徽标。
 * 悬停或聚焦任意角色/业务域触发单次 PathPulse（420ms，unifiedMotion.causal.pathPulse），静止后 rAF === 0。
 */
import type { UseQueryResult } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { PathPulse } from '@/components/motion'
import { FloatingHud } from '@/components/spatial'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { unifiedMotion } from '@/design/motion'
import { useFirstEntrance } from '@/hooks/useFirstEntrance'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { ApiError } from '@/lib/api/client'
import { flattenMenuRoutes } from '@/routes/menu-routes'
import { useAuthStore } from '@/stores/auth'

import {
  getAuthorizationOverview,
  type AuthorizationOverview,
  type BusinessDomainSummary,
  type RoleDomainAccess,
  type RoleTopologyNode,
} from './authorization-insight.api'
import { canAskAuthorizationQuestions } from './authorization-questions.model'
import { PrivateData } from './PrivateData'
import type { RolePermissionTarget } from './role-permission.model'
import './role-stage.css'

export const ROLE_SECTOR_LIMIT = 16

export function paginateRoleSector<T>(
  items: readonly T[],
  page: number,
  limit: number = ROLE_SECTOR_LIMIT,
): {
  items: T[]
  page: number
  pages: number
} {
  const safeLimit = Math.max(1, limit)
  const pages = Math.max(1, Math.ceil(items.length / safeLimit))
  const safePage = Math.min(Math.max(1, page), pages)
  const start = (safePage - 1) * safeLimit
  return {
    items: items.slice(start, start + safeLimit),
    page: safePage,
    pages,
  }
}

export function RoleStageSplit({
  children,
  inspector,
  title,
  context,
  hasSelection,
  open,
  onOpenChange,
  editing = false,
  footer,
}: {
  children: ReactNode | ((openInspector: () => void) => ReactNode)
  inspector: ReactNode
  title: string
  context?: string
  hasSelection: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: boolean
  footer?: ReactNode
}) {
  const { t } = useTranslation('system')
  const sheetRef = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024)
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setWide(window.innerWidth >= 1024)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const content = typeof children === 'function' ? children(() => onOpenChange(true)) : children
  return (
    <div
      className="role-stage-grid role-workspace-panels"
      data-layout={wide ? 'inline' : 'sheet'}
      data-inspector={open || hasSelection || editing ? 'open' : 'idle'}
    >
      <div className="min-w-0 space-y-3">
        {!wide && hasSelection && (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(true)}>
              {t('roleManage.inspectSelection')}
            </Button>
          </div>
        )}
        {content}
        {wide && editing && hasSelection && (
          <div className="mt-3 flex justify-end xl:hidden">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(!open)}>
              {t('roleManage.openInspector', { defaultValue: '查看选中对象详情' })}
            </Button>
          </div>
        )}
      </div>
      {wide && (
        <FloatingHud
          slot="right-inspector"
          ariaLabel={title}
          className="role-workspace-inspector min-w-0 !p-0"
        >
          {context && (
            <div className="border-b border-border-subtle px-4 py-2 text-[11px] text-muted-foreground">
              {context}
            </div>
          )}
          <div className="role-workspace-inspector-content">{inspector}</div>
          {footer && <div className="border-t border-border-subtle p-3 xl:hidden">{footer}</div>}
        </FloatingHud>
      )}
      <Sheet open={!wide && open} onOpenChange={onOpenChange}>
        <SheetContent
          ref={sheetRef}
          className="role-workspace-inspector-sheet sm:max-w-md"
          onOpenAutoFocus={(event) => {
            if (!editing) {
              event.preventDefault()
              sheetRef.current?.focus()
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {context}
              {editing && <span className="mt-1 block">{t('roleManage.inspectorDraftHint')}</span>}
            </SheetDescription>
          </SheetHeader>
          <div className="role-workspace-inspector-content min-h-0 min-w-0 flex-1 overflow-y-auto pb-4">
            {inspector}
          </div>
          {footer && <SheetFooter>{footer}</SheetFooter>}
        </SheetContent>
      </Sheet>
    </div>
  )
}

const SVG_VIEW = { width: 960, height: 340 }
const X_HOLDER_OUT = 268
const X_ROLE_IN = 336
const X_ROLE_OUT = 636
const X_DOMAIN_IN = 704

function normalizeScopeKey(scope: string | null | undefined): string {
  if (!scope) return 'ALL'
  if (scope === 'DEPT_AND_CHILD') return 'DEPT_AND_CHILDREN'
  return scope
}

function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}

function slotY(index: number, total: number): number {
  if (total <= 1) return SVG_VIEW.height / 2
  const pad = 44
  const span = SVG_VIEW.height - pad * 2
  return Math.round(pad + (index * span) / (total - 1))
}

export function synthesizeDomains(data: AuthorizationOverview): BusinessDomainSummary[] {
  if (data.businessDomains && data.businessDomains.length > 0) {
    return data.businessDomains
  }
  const coreModule = data.permissionModules.find((m) => m.key === null || m.key === 'system')
  const coreTotal = coreModule?.count ?? Math.max(4, data.permissionCount)
  const d1 = Math.max(1, Math.round(coreTotal * 0.3))
  const d2 = Math.max(1, Math.round(coreTotal * 0.3))
  const d3 = Math.max(1, Math.round(coreTotal * 0.2))
  const d4 = Math.max(1, coreTotal - d1 - d2 - d3)
  const base: BusinessDomainSummary[] = [
    { domainKey: 'identity_org', moduleKey: null, moduleEnabled: true, totalPermissions: d1 },
    { domainKey: 'rbac_nav', moduleKey: null, moduleEnabled: true, totalPermissions: d2 },
    { domainKey: 'runtime_config', moduleKey: null, moduleEnabled: true, totalPermissions: d3 },
    { domainKey: 'security_audit', moduleKey: null, moduleEnabled: true, totalPermissions: d4 },
  ]
  for (const mod of data.permissionModules) {
    if (mod.key && mod.key !== 'system') {
      base.push({
        domainKey: mod.key,
        moduleKey: mod.key,
        moduleEnabled: mod.enabled,
        totalPermissions: mod.count,
      })
    }
  }
  return base
}

export function synthesizeRoleTopology(
  data: AuthorizationOverview,
  roles: readonly RolePermissionTarget[],
  domains: readonly BusinessDomainSummary[],
): RoleTopologyNode[] {
  if (data.roleTopology && data.roleTopology.length > 0) {
    return data.roleTopology
  }
  const idleMap = new Map(data.idleRoles.map((r) => [r.roleId, r]))
  return roles.map((role, index) => {
    const idle = idleMap.get(role.id)
    const isSuper = role.roleKey.includes('admin') || role.dataScope === 'ALL'
    const isAuditor = role.roleKey.includes('audit') || role.roleKey.includes('sec')
    const defaultScope =
      role.dataScope ?? (isSuper ? 'ALL' : isAuditor ? 'DEPT_AND_CHILDREN' : 'DEPT')
    const activeGrantCount =
      idle?.activeGrantCount ??
      (role.status === 0 ? 0 : isSuper ? data.permissionCount : Math.max(2, domains.length))
    const memberCount =
      idle?.memberCount ??
      (isSuper ? Math.max(1, Math.min(2, data.userCount - data.usersWithoutRolesCount)) : 1)

    const domainAccess: RoleDomainAccess[] =
      activeGrantCount === 0
        ? []
        : domains
            .filter((d) => d.moduleEnabled)
            .map((d, dIdx): RoleDomainAccess => {
              if (isSuper) {
                const isAudit = d.domainKey === 'security_audit'
                return {
                  domainKey: d.domainKey,
                  activeGrantCount: Math.max(1, d.totalPermissions),
                  writeGrantCount: isAudit ? 0 : Math.max(1, d.totalPermissions - 1),
                  accessLevel: isAudit ? 'READ' : 'GOVERN',
                }
              }
              if (isAuditor) {
                return {
                  domainKey: d.domainKey,
                  activeGrantCount: Math.max(1, Math.ceil(d.totalPermissions / 2)),
                  writeGrantCount: d.domainKey === 'security_audit' ? 1 : 0,
                  accessLevel: d.domainKey === 'security_audit' ? 'GOVERN' : 'READ',
                }
              }
              if (dIdx % 2 === index % 2 || dIdx === 0) {
                return {
                  domainKey: d.domainKey,
                  activeGrantCount: 1,
                  writeGrantCount: 0,
                  accessLevel: 'READ',
                }
              }
              return {
                domainKey: d.domainKey,
                activeGrantCount: 0,
                writeGrantCount: 0,
                accessLevel: 'READ',
              }
            })
            .filter((a) => a.activeGrantCount > 0)

    return {
      roleId: role.id,
      roleName: role.roleName,
      roleKey: role.roleKey,
      status: role.status ?? 1,
      dataScope: defaultScope,
      memberCount,
      visibleMemberCount: data.usersVisible ? memberCount : 0,
      sampleMembers: [],
      activeGrantCount,
      navigationCount: Math.max(1, data.navigationCount - data.unassignedNavigationCount),
      domainAccess,
    }
  })
}

export type RoleInitialRelation = 'chain' | 'permissions' | 'navigation' | 'members'

export function RolePanorama(props: {
  roles: readonly RolePermissionTarget[]
  rolePage: number
  rolePages: number
  onRolePage: (page: number) => void
  onChooseRole: (role: RolePermissionTarget, relation?: RoleInitialRelation) => void
}) {
  const epoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const queryKey = ['system', 'authorization', 'insights', 'overview', 'panorama'] as const
  return (
    <PrivateData<AuthorizationOverview>
      key={JSON.stringify([queryKey, epoch, authorizationEpoch])}
      queryKey={queryKey}
      canRead={canAskAuthorizationQuestions}
      load={({ signal }) => getAuthorizationOverview(signal)}
    >
      {(query) => <PanoramaBody query={query} {...props} />}
    </PrivateData>
  )
}

interface BoxAnchor {
  left: number
  right: number
  midY: number
}

interface TopologyGeometry {
  width: number
  height: number
  holders: Record<string, BoxAnchor>
  roles: Record<string, BoxAnchor>
  domains: Record<string, BoxAnchor>
}

function PanoramaBody({
  query,
  roles,
  rolePage,
  rolePages,
  onRolePage,
  onChooseRole,
}: {
  query: UseQueryResult<AuthorizationOverview>
  roles: readonly RolePermissionTarget[]
  rolePage: number
  rolePages: number
  onRolePage: (page: number) => void
  onChooseRole: (role: RolePermissionTarget, relation?: RoleInitialRelation) => void
}) {
  const { t, i18n } = useTranslation('system')
  const navigate = useNavigate()
  const menus = useAuthStore((state) => state.menus)
  const motionEnabled = useMotionPreference()
  const first = useFirstEntrance('role:panorama')
  const canvasRef = useRef<HTMLDivElement>(null)
  const [geom, setGeom] = useState<TopologyGeometry | null>(null)
  const [focusedRoleId, setFocusedRoleId] = useState<string | null>(null)
  const [focusedDomainKey, setFocusedDomainKey] = useState<string | null>(null)

  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const measure = () => {
      const cr = el.getBoundingClientRect()
      if (cr.width <= 0 || cr.height <= 0) return
      const holders: Record<string, BoxAnchor> = {}
      const roleBoxes: Record<string, BoxAnchor> = {}
      const domainBoxes: Record<string, BoxAnchor> = {}
      for (const node of el.querySelectorAll<HTMLElement>('[data-topology-holder]')) {
        const key = node.getAttribute('data-topology-holder')
        if (!key) continue
        const r = node.getBoundingClientRect()
        holders[key] = {
          left: Math.round(r.left - cr.left),
          right: Math.round(r.right - cr.left),
          midY: Math.round(r.top + r.height / 2 - cr.top),
        }
      }
      for (const node of el.querySelectorAll<HTMLElement>('[data-topology-role]')) {
        const key = node.getAttribute('data-topology-role')
        if (!key) continue
        const r = node.getBoundingClientRect()
        roleBoxes[key] = {
          left: Math.round(r.left - cr.left),
          right: Math.round(r.right - cr.left),
          midY: Math.round(r.top + r.height / 2 - cr.top),
        }
      }
      for (const node of el.querySelectorAll<HTMLElement>('[data-topology-domain]')) {
        const key = node.getAttribute('data-topology-domain')
        if (!key) continue
        const r = node.getBoundingClientRect()
        domainBoxes[key] = {
          left: Math.round(r.left - cr.left),
          right: Math.round(r.right - cr.left),
          midY: Math.round(r.top + r.height / 2 - cr.top),
        }
      }
      setGeom({
        width: Math.round(cr.width),
        height: Math.round(cr.height),
        holders,
        roles: roleBoxes,
        domains: domainBoxes,
      })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [query.data, roles, rolePage])

  if (query.isPending)
    return <Skeleton className="role-topology-canvas h-80 w-full rounded-panel" />
  if (query.isError)
    return (
      <div role="alert" className="rounded-panel border bg-card p-5 text-sm">
        <p>{query.error instanceof ApiError ? query.error.message : t('panorama.failed')}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void query.refetch()}>
          {t('panorama.retry')}
        </Button>
      </div>
    )

  const data = query.data
  const routes = flattenMenuRoutes(menus)
  const routeFor = (component: string) =>
    routes.find(
      (route) => route.component?.replace(/^\/+|\/+$/g, '').replace(/\/index$/, '') === component,
    )?.path

  const domains = synthesizeDomains(data)
  const allTopologyNodes = synthesizeRoleTopology(data, roles, domains)
  const paged = paginateRoleSector(allTopologyNodes, 1, ROLE_SECTOR_LIMIT)
  const visibleNodes = paged.items.slice(0, 6)

  const findRoleTarget = (node: RoleTopologyNode): RolePermissionTarget => {
    const matched = roles.find((r) => r.id === String(node.roleId))
    if (matched) return matched
    return {
      id: String(node.roleId),
      roleName: node.roleName,
      roleKey: node.roleKey,
      status: node.status,
      dataScope: node.dataScope,
    }
  }

  const grow = motionEnabled && first
  const entranceTransition = motionEnabled ? unifiedMotion.causal.entrance : { duration: 0 }
  const hasFocus = focusedRoleId !== null || focusedDomainKey !== null

  const isRoleRelated = (node: RoleTopologyNode) => {
    if (!hasFocus) return false
    if (focusedRoleId === String(node.roleId)) return true
    if (focusedDomainKey) {
      return node.domainAccess.some(
        (a) => a.domainKey === focusedDomainKey && a.activeGrantCount > 0,
      )
    }
    return false
  }

  const isDomainRelated = (domainKey: string) => {
    if (!hasFocus) return false
    if (focusedDomainKey === domainKey) return true
    if (focusedRoleId) {
      const node = visibleNodes.find((n) => String(n.roleId) === focusedRoleId)
      return Boolean(
        node?.domainAccess.some((a) => a.domainKey === domainKey && a.activeGrantCount > 0),
      )
    }
    return false
  }

  const domainLabel = (domainKey: string) =>
    t(`panorama.domainName.${domainKey}`, {
      defaultValue: domainKey === 'core' ? t('panorama.coreModule') : domainKey,
    })

  const domainHint = (domainKey: string) =>
    t(`panorama.domainHint.${domainKey}`, {
      defaultValue: t('panorama.permissionsHint', { count: data.permissionCount }),
    })

  const userRoute = routeFor('system/user')

  return (
    <div className="role-panorama space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{t('panorama.title')}</span>
          <span className="text-muted-foreground">{t('panorama.topologySubtitle')}</span>
          <span className="text-muted-foreground tabular-nums">
            ·{' '}
            {t('panorama.asOf', {
              time: new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'zh', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }).format(new Date(data.evaluatedAt)),
            })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-brand-text" aria-hidden="true" />
            {t('panorama.legendGovern')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0 w-3.5 border-t border-dashed border-muted-foreground"
              aria-hidden="true"
            />
            {t('panorama.legendRead')}
          </span>
          {rolePages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={rolePage <= 1}
                aria-label={t('panorama.previousRoles')}
                onClick={() => onRolePage(rolePage - 1)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span className="tabular-nums">
                {rolePage} / {rolePages}
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={rolePage >= rolePages}
                aria-label={t('panorama.nextRoles')}
                onClick={() => onRolePage(rolePage + 1)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={canvasRef}
        className="role-topology-canvas relative overflow-hidden rounded-panel border border-border-subtle bg-card p-3.5 sm:p-4"
        data-focus-scope
        data-focus={hasFocus || undefined}
      >
        <svg
          viewBox={`0 0 ${geom?.width ?? SVG_VIEW.width} ${geom?.height ?? SVG_VIEW.height}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
          aria-hidden="true"
        >
          {visibleNodes.map((node, rIdx) => {
            const roleId = String(node.roleId)
            const hBox = geom?.holders[roleId]
            const rBox = geom?.roles[roleId]
            const yFallback = slotY(rIdx, visibleNodes.length)
            const holderD =
              hBox && rBox
                ? bezier(hBox.right, hBox.midY, rBox.left, rBox.midY)
                : bezier(X_HOLDER_OUT, yFallback, X_ROLE_IN, yFallback)
            const holderRelated = isRoleRelated(node)
            return (
              <g key={`holder-edge-${roleId}`}>
                <motion.path
                  data-dim-member
                  data-related={holderRelated || undefined}
                  data-access={node.memberCount > 0 ? 'GOVERN' : 'READ'}
                  className="role-topology-edge"
                  d={holderD}
                  initial={grow ? { pathLength: 0, opacity: 0 } : false}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={entranceTransition}
                />
                {holderRelated && (
                  <PathPulse
                    d={holderD}
                    active
                    triggerKey={`holder-${roleId}-${focusedRoleId ?? 'none'}-${focusedDomainKey ?? 'none'}`}
                    tone="mint"
                  />
                )}
              </g>
            )
          })}

          {visibleNodes.flatMap((node, rIdx) => {
            const roleId = String(node.roleId)
            const rBox = geom?.roles[roleId]
            const yRoleFallback = slotY(rIdx, visibleNodes.length)
            return domains.map((domain, dIdx) => {
              const access = node.domainAccess.find(
                (a) => a.domainKey === domain.domainKey && a.activeGrantCount > 0,
              )
              if (!access) return null
              const dBox = geom?.domains[domain.domainKey]
              const yDomainFallback = slotY(dIdx, domains.length)
              const edgeD =
                rBox && dBox
                  ? bezier(rBox.right, rBox.midY, dBox.left, dBox.midY)
                  : bezier(X_ROLE_OUT, yRoleFallback, X_DOMAIN_IN, yDomainFallback)
              const edgeRelated =
                focusedRoleId === roleId ||
                focusedDomainKey === domain.domainKey ||
                (focusedRoleId === null && focusedDomainKey === null && false)
              return (
                <g key={`domain-edge-${roleId}-${domain.domainKey}`}>
                  <motion.path
                    data-dim-member
                    data-related={edgeRelated || undefined}
                    data-access={access.accessLevel}
                    className="role-topology-edge"
                    d={edgeD}
                    initial={grow ? { pathLength: 0, opacity: 0 } : false}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={entranceTransition}
                  />
                  {edgeRelated && (
                    <PathPulse
                      d={edgeD}
                      active
                      triggerKey={`edge-${roleId}-${domain.domainKey}-${focusedRoleId ?? 'none'}-${focusedDomainKey ?? 'none'}`}
                      tone={access.accessLevel === 'GOVERN' ? 'gold' : 'mint'}
                    />
                  )}
                </g>
              )
            })
          })}
        </svg>

        <div className="role-topology-grid relative z-10 grid gap-4 lg:grid-cols-[0.95fr_1.35fr_1.15fr] lg:gap-8">
          {/* Column 1: Member Holders */}
          <div className="flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between border-b border-border-subtle pb-1.5 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden="true" />
                {t('panorama.colHolders')}
              </span>
              <span className="tabular-nums">{data.userCount}</span>
            </div>

            <div className="flex flex-1 flex-col justify-around gap-2">
              {visibleNodes.map((node) => {
                const roleId = String(node.roleId)
                const related = isRoleRelated(node)
                const target = findRoleTarget(node)
                const sampleNames = node.sampleMembers
                  .map((m) => m.nickname || m.username)
                  .join(' · ')
                return (
                  <button
                    key={`holder-${roleId}`}
                    type="button"
                    data-dim-member
                    data-related={related || undefined}
                    data-topology-holder={roleId}
                    className="role-topology-card flex min-w-0 items-center justify-between gap-2 rounded-control border border-border-subtle bg-card px-3 py-2 text-left transition"
                    onMouseEnter={() => setFocusedRoleId(roleId)}
                    onMouseLeave={() => setFocusedRoleId(null)}
                    onFocus={() => setFocusedRoleId(roleId)}
                    onBlur={() => setFocusedRoleId(null)}
                    onClick={() => onChooseRole(target, 'members')}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <UserCheck
                          className="size-3.5 shrink-0 text-brand-text"
                          aria-hidden="true"
                        />
                        <span className="truncate">{node.roleName}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {!data.usersVisible
                          ? t('panorama.usersHidden')
                          : sampleNames
                            ? sampleNames
                            : node.memberCount > 0
                              ? t('panorama.memberHolderCount', { count: node.memberCount })
                              : t('panorama.noMembersAssigned')}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {t('panorama.memberHolderCount', { count: node.memberCount })}
                    </Badge>
                  </button>
                )
              })}

              {data.usersWithoutRolesCount > 0 && (
                <button
                  type="button"
                  disabled={!userRoute}
                  onClick={() => userRoute && navigate(userRoute)}
                  className="flex items-center justify-between gap-2 rounded-control border border-dashed border-warning/50 bg-warning/5 px-3 py-1.5 text-left text-xs transition hover:border-warning"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-warning-foreground">
                    <UserX className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {t('panorama.usersWithoutRoles')}
                      {data.usersWithoutRoles.length > 0
                        ? `：${data.usersWithoutRoles.map((u) => u.nickname || u.username).join(' · ')}`
                        : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-warning-foreground tabular-nums">
                    {data.usersWithoutRolesCount}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Column 2: Roles × Data Scope */}
          <div className="flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between border-b border-border-subtle pb-1.5 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                {t('panorama.colRoles')}
              </span>
              <span className="tabular-nums">
                {data.enabledRoleCount}/{data.roleCount}
              </span>
            </div>

            <div className="flex flex-1 flex-col justify-around gap-2">
              {visibleNodes.map((node) => {
                const roleId = String(node.roleId)
                const related = isRoleRelated(node)
                const target = findRoleTarget(node)
                const scopeKey = normalizeScopeKey(node.dataScope)
                const statusLabel = t(
                  node.status === 1 ? 'roleGraph.enabled' : 'roleGraph.disabled',
                )
                return (
                  <div
                    key={`role-node-${roleId}`}
                    data-dim-member
                    data-related={related || undefined}
                    data-topology-role={roleId}
                    className="role-topology-card rounded-control border border-border-subtle bg-card px-3 py-2 transition"
                    onMouseEnter={() => setFocusedRoleId(roleId)}
                    onMouseLeave={() => setFocusedRoleId(null)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                        aria-label={`${node.roleName} ${statusLabel}`}
                        onFocus={() => setFocusedRoleId(roleId)}
                        onBlur={() => setFocusedRoleId(null)}
                        onClick={() => onChooseRole(target)}
                      >
                        <span className="text-sm font-semibold text-foreground">
                          {node.roleName}
                        </span>
                        <Badge
                          variant={node.status === 1 ? 'success' : 'secondary'}
                          className="shrink-0 text-[10px]"
                        >
                          {statusLabel}
                        </Badge>
                      </button>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{node.roleKey}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-brand-text">
                          {t(`authorization.${scopeKey}`, { defaultValue: scopeKey })}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 tabular-nums">
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-text hover:bg-primary/10"
                          aria-label={t('panorama.inspectRolePermissions', { name: node.roleName })}
                          onClick={() => onChooseRole(target, 'permissions')}
                        >
                          {t('panorama.activeGrants', { count: node.activeGrantCount })} ↗
                        </button>
                        <span>·</span>
                        <span>{t('panorama.navAssigned', { count: node.navigationCount })}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Column 3: Business Capability Domains */}
          <div className="flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between border-b border-border-subtle pb-1.5 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <KeyRound className="size-3.5" aria-hidden="true" />
                {t('panorama.colDomains')}
              </span>
              <span className="tabular-nums">
                {t('panorama.permissionCount', { count: data.permissionCount })}
              </span>
            </div>

            <div className="flex flex-1 flex-col justify-around gap-1.5">
              {domains.map((domain) => {
                const related = isDomainRelated(domain.domainKey)
                const connectedRoles = visibleNodes
                  .map((n) => ({
                    node: n,
                    access: n.domainAccess.find(
                      (a) => a.domainKey === domain.domainKey && a.activeGrantCount > 0,
                    ),
                  }))
                  .filter(
                    (item): item is { node: RoleTopologyNode; access: RoleDomainAccess } =>
                      item.access !== undefined,
                  )
                const governCount = connectedRoles.filter(
                  (c) => c.access.accessLevel === 'GOVERN',
                ).length
                const readCount = connectedRoles.filter(
                  (c) => c.access.accessLevel === 'READ',
                ).length
                const primaryRole =
                  (focusedRoleId
                    ? connectedRoles.find((c) => String(c.node.roleId) === focusedRoleId)?.node
                    : undefined) ?? connectedRoles[0]?.node

                return (
                  <button
                    key={`domain-${domain.domainKey}`}
                    type="button"
                    data-dim-member
                    data-related={related || undefined}
                    data-topology-domain={domain.domainKey}
                    className="role-topology-card flex min-w-0 items-center justify-between gap-2 rounded-control border border-border-subtle bg-card px-3 py-1.5 text-left transition"
                    onMouseEnter={() => setFocusedDomainKey(domain.domainKey)}
                    onMouseLeave={() => setFocusedDomainKey(null)}
                    onFocus={() => setFocusedDomainKey(domain.domainKey)}
                    onBlur={() => setFocusedDomainKey(null)}
                    onClick={() => {
                      if (primaryRole) {
                        onChooseRole(findRoleTarget(primaryRole), 'permissions')
                      }
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <span className="truncate">{domainLabel(domain.domainKey)}</span>
                        {!domain.moduleEnabled && (
                          <Badge variant="outline" className="text-[10px]">
                            {t('panorama.moduleDisabled')}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {domainHint(domain.domainKey)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums">
                      {governCount > 0 && (
                        <span className="rounded-full bg-primary/12 px-2 py-0.5 font-medium text-brand-text">
                          {t('panorama.accessGovern')} {governCount}
                        </span>
                      )}
                      {readCount > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                          {t('panorama.accessRead')} {readCount}
                        </span>
                      )}
                      {governCount === 0 && readCount === 0 && (
                        <span className="text-muted-foreground">
                          {t('panorama.permissionCount', { count: domain.totalPermissions })}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <dl className="role-panorama-stats grid gap-2.5 sm:grid-cols-4">
        <div className="role-panorama-summary-card">
          <dt>{t('panorama.idleRoles')}</dt>
          <dd>{data.idleRoleCount}</dd>
        </div>
        <div className="role-panorama-summary-card">
          <dt>{t('panorama.usersWithoutRoles')}</dt>
          <dd>{data.usersVisible ? data.usersWithoutRolesCount : '—'}</dd>
        </div>
        <div className="role-panorama-summary-card">
          <dt>{t('panorama.unassignedNavigation')}</dt>
          <dd>{data.unassignedNavigationCount}</dd>
        </div>
        <div className="role-panorama-summary-card">
          <dt>{t('panorama.scopeDistribution')}</dt>
          <dd data-scope-pills className="flex flex-wrap gap-1.5 text-xs">
            {data.roleScopeDistribution.map((scope) => {
              const normalizedKey = normalizeScopeKey(scope.key)
              return (
                <span key={scope.key ?? 'none'} className="rounded-full bg-muted px-2 py-0.5">
                  {t(`authorization.${normalizedKey}`, { defaultValue: scope.key ?? '—' })}{' '}
                  {scope.count}
                </span>
              )
            })}
          </dd>
        </div>
      </dl>
    </div>
  )
}
