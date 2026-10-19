/**
 * 权限全景（桌面图谱模式 L0/L1）：中心与用户、角色、业务权限、导航四个计数盘；
 * 首次进入一次性生长，悬停/聚焦弱化无关分支；打开某盘后该盘移至左侧，右侧展开条目。
 * 数据来自授权洞察只读接口与当前角色分页；只表达授权配置，不推断用户最终有效权限。
 */
import type { UseQueryResult } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LayoutList,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { insightMotion, stateMotion } from '@/design/motion'
import { useFirstEntrance } from '@/hooks/useFirstEntrance'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { ApiError } from '@/lib/api/client'
import { flattenMenuRoutes } from '@/routes/menu-routes'
import { useAuthStore } from '@/stores/auth'

import { getAuthorizationOverview, type AuthorizationOverview } from './authorization-insight.api'
import { canAskAuthorizationQuestions } from './authorization-questions.model'
import { PrivateData } from './PrivateData'
import type { RolePermissionTarget } from './role-permission.model'
import './role-panorama.css'

type Dial = 'users' | 'roles' | 'permissions' | 'navigation'
const dials: readonly Dial[] = ['users', 'roles', 'permissions', 'navigation']
const VIEW = { width: 820, height: 520 }
const HUB = { x: 410, y: 260, r: 58 }
const DIAL_R = 46
const dialHome: Record<Dial, { x: number; y: number }> = {
  users: { x: 150, y: 260 },
  roles: { x: 410, y: 96 },
  permissions: { x: 670, y: 260 },
  navigation: { x: 410, y: 424 },
}
const BRANCH_DIAL = { x: 200, y: 260 }
const BRANCH_ITEM_X = 520
const ITEM_LIMIT = 8

interface BranchItem {
  key: string
  label: string
  detail: string
  onOpen?: () => void
}

function percent(point: { x: number; y: number }) {
  return { left: `${(point.x / VIEW.width) * 100}%`, top: `${(point.y / VIEW.height) * 100}%` }
}

function curve(from: { x: number; y: number }, to: { x: number; y: number }) {
  const middle = (from.x + to.x) / 2
  return `M ${from.x} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x} ${to.y}`
}

export function RolePanorama(props: {
  roles: readonly RolePermissionTarget[]
  rolePage: number
  rolePages: number
  onRolePage: (page: number) => void
  onChooseRole: (role: RolePermissionTarget) => void
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
  onChooseRole: (role: RolePermissionTarget) => void
}) {
  const { t } = useTranslation('system')
  const navigate = useNavigate()
  const menus = useAuthStore((state) => state.menus)
  const motionEnabled = useMotionPreference()
  const first = useFirstEntrance('role:panorama')
  const [branch, setBranch] = useState<Dial | null>(null)
  const [focus, setFocus] = useState<Dial | null>(null)
  if (query.isPending)
    return <Skeleton className="role-panorama-canvas h-auto w-full rounded-2xl" />
  if (query.isError)
    return (
      <div role="alert" className="rounded-2xl border bg-card p-5 text-sm">
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
  const grow = motionEnabled && first
  const transition = motionEnabled ? insightMotion.layout : insightMotion.instant
  const assignedNavigation = data.navigationCount - data.unassignedNavigationCount
  const enabledPermissions = data.permissionModules
    .filter((module) => module.enabled)
    .reduce((sum, module) => sum + module.count, 0)
  const dialMeta: Record<Dial, { count: number; ratio: number; icon: typeof Users; hint: string }> =
    {
      users: {
        count: data.userCount,
        ratio: data.userCount ? (data.userCount - data.usersWithoutRolesCount) / data.userCount : 0,
        icon: Users,
        hint: data.usersVisible
          ? t('panorama.usersHint', { count: data.usersWithoutRolesCount })
          : t('panorama.usersHidden'),
      },
      roles: {
        count: data.roleCount,
        ratio: data.roleCount ? data.enabledRoleCount / data.roleCount : 0,
        icon: ShieldCheck,
        hint: t('panorama.rolesHint', { enabled: data.enabledRoleCount, idle: data.idleRoleCount }),
      },
      permissions: {
        count: data.permissionCount,
        ratio: data.permissionCount ? enabledPermissions / data.permissionCount : 0,
        icon: KeyRound,
        hint: t('panorama.permissionsHint', { count: enabledPermissions }),
      },
      navigation: {
        count: data.navigationCount,
        ratio: data.navigationCount ? assignedNavigation / data.navigationCount : 0,
        icon: LayoutList,
        hint: t('panorama.navigationHint', { count: data.unassignedNavigationCount }),
      },
    }
  const items: BranchItem[] =
    branch === 'roles'
      ? roles.map((role) => ({
          key: role.id,
          label: role.roleName,
          detail: t(role.status === 1 ? 'roleGraph.enabled' : 'roleGraph.disabled'),
          onOpen: () => onChooseRole(role),
        }))
      : branch === 'users'
        ? data.usersWithoutRoles.slice(0, ITEM_LIMIT).map((user) => ({
            key: user.id,
            label: user.nickname || user.username,
            detail: t('panorama.noRole'),
            onOpen: routeFor('system/user') ? () => navigate(routeFor('system/user')!) : undefined,
          }))
        : branch === 'permissions'
          ? data.permissionModules.slice(0, ITEM_LIMIT).map((module) => ({
              key: module.key ?? 'core',
              label: module.key ?? t('panorama.coreModule'),
              detail: `${t('panorama.permissionCount', { count: module.count })}${module.enabled ? '' : ` · ${t('panorama.moduleDisabled')}`}`,
              onOpen: routeFor('system/permission')
                ? () => navigate(routeFor('system/permission')!)
                : undefined,
            }))
          : branch === 'navigation'
            ? data.unassignedNavigation.slice(0, ITEM_LIMIT).map((menu) => ({
                key: menu.menuId,
                label: menu.menuName,
                detail: t('panorama.unassigned'),
                onOpen: routeFor('system/menu')
                  ? () =>
                      navigate(
                        `${routeFor('system/menu')}?menuId=${encodeURIComponent(menu.menuId)}`,
                      )
                  : undefined,
              }))
            : []
  const itemY = (index: number) =>
    items.length <= 1 ? HUB.y : 70 + (index * (VIEW.height - 140)) / (items.length - 1)
  const dialPoint = (dial: Dial) =>
    branch === null ? dialHome[dial] : branch === dial ? BRANCH_DIAL : dialHome[dial]
  const hubPoint = branch === null ? HUB : { x: 64, y: HUB.y, r: 22 }
  const extra =
    branch === 'users'
      ? data.usersWithoutRolesCount - items.length
      : branch === 'navigation'
        ? data.unassignedNavigationCount - items.length
        : 0
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {branch === null ? (
          <span className="flex h-8 items-center px-2.5 font-medium">{t('panorama.title')}</span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setBranch(null)}
            aria-label={t('panorama.back')}
          >
            <ArrowLeft aria-hidden="true" />
            {t('panorama.title')}
          </Button>
        )}
        {branch && (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{t(`panorama.dial.${branch}`)}</span>
          </>
        )}
      </div>
      <div
        className="role-panorama-canvas relative overflow-hidden rounded-2xl border bg-card"
        data-focus-scope
        data-focus={focus !== null || undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && branch) {
            event.stopPropagation()
            setBranch(null)
          }
        }}
      >
        <svg
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          {[HUB.r + 30, HUB.r + 70].map((radius, index) => (
            <motion.circle
              key={radius}
              cx={hubPoint.x}
              cy={hubPoint.y}
              className="role-panorama-ring"
              initial={grow ? { r: 0, opacity: 0 } : false}
              animate={{ r: branch ? 0 : radius, opacity: branch ? 0 : 1 }}
              transition={{ ...transition, delay: grow ? index * stateMotion.growthStagger : 0 }}
            />
          ))}
          {dials.map((dial, index) => {
            const point = dialPoint(dial)
            const visible = branch === null || branch === dial
            return (
              <motion.path
                key={`edge-${dial}`}
                data-dim-member
                data-related={focus === dial || undefined}
                className="role-panorama-edge"
                d={curve(hubPoint, point)}
                initial={grow ? { pathLength: 0 } : false}
                animate={{ pathLength: 1, opacity: visible ? 1 : 0 }}
                transition={{
                  ...transition,
                  delay: grow ? 0.12 + index * stateMotion.growthStagger : 0,
                }}
              />
            )
          })}
          {items.map((item, index) => (
            <motion.path
              key={`item-edge-${item.key}`}
              className="role-panorama-edge"
              data-branch-edge
              d={curve(BRANCH_DIAL, { x: BRANCH_ITEM_X, y: itemY(index) })}
              initial={motionEnabled ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ ...insightMotion.chart, delay: motionEnabled ? index * 0.03 : 0 }}
            />
          ))}
          {dials.map((dial) => {
            const point = dialPoint(dial)
            const visible = branch === null || branch === dial
            const ticks = 36
            const active = Math.round(dialMeta[dial].ratio * ticks)
            return (
              <motion.g
                key={`ticks-${dial}`}
                data-dim-member
                data-related={focus === dial || undefined}
                initial={grow ? { x: HUB.x, y: HUB.y, opacity: 0 } : false}
                animate={{
                  x: point.x,
                  y: point.y,
                  opacity: visible ? 1 : 0,
                  scale: visible ? 1 : 0.6,
                }}
                transition={transition}
              >
                {Array.from({ length: ticks }, (_, tick) => {
                  const angle = (tick / ticks) * Math.PI * 2 - Math.PI / 2
                  const inner = DIAL_R + 6
                  const outer = DIAL_R + (tick % 3 === 0 ? 14 : 11)
                  return (
                    <line
                      key={tick}
                      x1={Math.cos(angle) * inner}
                      y1={Math.sin(angle) * inner}
                      x2={Math.cos(angle) * outer}
                      y2={Math.sin(angle) * outer}
                      className="role-panorama-tick"
                      data-active={tick < active || undefined}
                    />
                  )
                })}
              </motion.g>
            )
          })}
        </svg>
        <motion.div
          className="role-panorama-hub"
          style={{ ...percent(hubPoint), width: `${((hubPoint.r * 2) / VIEW.width) * 100}%` }}
          initial={grow ? { scale: 0.4, opacity: 0 } : false}
          animate={{ scale: 1, opacity: branch ? 0.45 : 1 }}
          transition={transition}
          aria-hidden={branch !== null || undefined}
        >
          {branch === null && (
            <>
              <span className="text-xs text-muted-foreground">{t('panorama.hub')}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(data.evaluatedAt).toLocaleTimeString()}
              </span>
            </>
          )}
        </motion.div>
        {dials.map((dial) => {
          const point = dialPoint(dial)
          const meta = dialMeta[dial]
          const visible = branch === null || branch === dial
          const Icon = meta.icon
          return (
            <motion.button
              key={dial}
              type="button"
              className="role-panorama-dial"
              data-dim-member
              data-related={focus === dial || undefined}
              data-open={branch === dial || undefined}
              style={{ width: `${((DIAL_R * 2) / VIEW.width) * 100}%` } as CSSProperties}
              initial={grow ? { ...percent(HUB), opacity: 0 } : false}
              animate={{ ...percent(point), opacity: visible ? 1 : 0 }}
              transition={transition}
              tabIndex={visible ? 0 : -1}
              aria-hidden={!visible || undefined}
              aria-expanded={branch === dial}
              aria-label={t('panorama.dialLabel', {
                name: t(`panorama.dial.${dial}`),
                count: meta.count,
                hint: meta.hint,
              })}
              onMouseEnter={() => setFocus(dial)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(dial)}
              onBlur={() => setFocus(null)}
              onClick={() => setBranch(branch === dial ? null : dial)}
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="insight-metric text-xl font-semibold">{meta.count}</span>
              <span className="text-xs text-muted-foreground">{t(`panorama.dial.${dial}`)}</span>
            </motion.button>
          )
        })}
        {items.map((item, index) => (
          <motion.button
            key={item.key}
            type="button"
            className="role-panorama-item"
            style={percent({ x: BRANCH_ITEM_X, y: itemY(index) })}
            initial={motionEnabled ? { opacity: 0, x: -16 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...insightMotion.surface, delay: motionEnabled ? index * 0.03 : 0 }}
            disabled={!item.onOpen}
            onClick={item.onOpen}
          >
            <span className="block truncate font-medium">{item.label}</span>
            <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
          </motion.button>
        ))}
        {branch && items.length === 0 && (
          <p role="status" className="role-panorama-empty text-sm text-muted-foreground">
            {t('panorama.emptyBranch')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p aria-live="polite">
          {focus
            ? dialMeta[focus].hint
            : branch
              ? dialMeta[branch].hint
              : t('panorama.instructions')}
        </p>
        {branch === 'roles' && rolePages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
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
              size="icon"
              variant="ghost"
              disabled={rolePage >= rolePages}
              aria-label={t('panorama.nextRoles')}
              onClick={() => onRolePage(rolePage + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        )}
        {extra > 0 && <span>{t('panorama.moreItems', { count: extra })}</span>}
      </div>
      <dl className="role-panorama-stats grid gap-3 sm:grid-cols-4">
        <div>
          <dt>{t('panorama.idleRoles')}</dt>
          <dd>{data.idleRoleCount}</dd>
        </div>
        <div>
          <dt>{t('panorama.usersWithoutRoles')}</dt>
          <dd>{data.usersVisible ? data.usersWithoutRolesCount : '—'}</dd>
        </div>
        <div>
          <dt>{t('panorama.unassignedNavigation')}</dt>
          <dd>{data.unassignedNavigationCount}</dd>
        </div>
        <div>
          <dt>{t('panorama.scopeDistribution')}</dt>
          <dd className="flex flex-wrap gap-1.5 text-xs">
            {data.roleScopeDistribution.map((scope) => (
              <span key={scope.key ?? 'none'} className="rounded-full bg-muted px-2 py-0.5">
                {t(`authorization.${scope.key}`, { defaultValue: scope.key ?? '—' })} {scope.count}
              </span>
            ))}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{t('panorama.disclaimer')}</p>
    </div>
  )
}
