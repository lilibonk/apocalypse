/**
 * 通用管理工作台：呈现脚手架能力、快捷入口、在线会话与近期管理活动。
 * 这里不展示数据库、缓存、JVM 等后端服务健康状态；那属于独立运维系统。
 */

import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  BookOpenText,
  KeyRound,
  MenuSquare,
  Radio,
  ScrollText,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
} from 'lucide-react'
import { useMemo, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { flattenMenuRoutes, type FlatRoute } from '@/routes/menu-routes'
import { useAuthStore } from '@/stores/auth'
import { pageLoginLogs } from '@/views/system/log/login/login-log.api'
import { pageOperLogs } from '@/views/system/log/oper/oper-log.api'
import { listOnlineUsers } from '@/views/system/online/online.api'

type IconType = ComponentType<{ className?: string }>

interface Capability {
  label: string
  description: string
  routeNames: string[]
  icon: IconType
}

interface QuickTarget {
  title: string
  icon: IconType
}

const capabilities: Capability[] = [
  {
    label: '身份与访问',
    description: '用户、角色与菜单权限',
    routeNames: ['用户管理', '角色管理', '菜单管理'],
    icon: ShieldCheck,
  },
  {
    label: '组织与配置',
    description: '部门、字典与系统参数',
    routeNames: ['部门管理', '字典管理', '参数设置'],
    icon: UserRoundCog,
  },
  {
    label: '会话管理',
    description: '在线会话与强制下线',
    routeNames: ['在线用户'],
    icon: Radio,
  },
  {
    label: '审计记录',
    description: '登录与后台操作追踪',
    routeNames: ['登录日志', '操作日志'],
    icon: ScrollText,
  },
]

const quickTargets: QuickTarget[] = [
  { title: '用户管理', icon: UsersRound },
  { title: '角色管理', icon: KeyRound },
  { title: '菜单管理', icon: MenuSquare },
  { title: '字典管理', icon: BookOpenText },
]

function findRoute(routes: FlatRoute[], titles: string[]): FlatRoute | undefined {
  return routes.find((route) => titles.includes(route.title))
}

function formatDateTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16)
}

function SectionSkeleton() {
  return (
    <div className="space-y-3 py-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  )
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const roles = useAuthStore((state) => state.roles)
  const perms = useAuthStore((state) => state.perms)
  const menus = useAuthStore((state) => state.menus)
  const routes = useMemo(() => flattenMenuRoutes(menus), [menus])

  const loginQuery = useQuery({
    queryKey: ['dashboard', 'login-logs'],
    queryFn: () => pageLoginLogs(1, 4),
    enabled: perms.includes('system:log:login'),
  })
  const operQuery = useQuery({
    queryKey: ['dashboard', 'oper-logs'],
    queryFn: () => pageOperLogs(1, 4),
    enabled: perms.includes('system:log:oper'),
  })
  const onlineQuery = useQuery({
    queryKey: ['dashboard', 'online-users'],
    queryFn: listOnlineUsers,
    enabled: perms.includes('system:online:list'),
  })

  const failedLogins = loginQuery.data?.list.filter((item) => item.success === 0).length ?? 0
  const menuCount = useMemo(() => {
    const count = (nodes: typeof menus): number =>
      nodes.reduce((total, node) => total + 1 + count(node.children), 0)
    return count(menus)
  }, [menus])

  const activity = useMemo(() => {
    const loginItems = (loginQuery.data?.list ?? []).map((item) => ({
      id: `login-${item.id}`,
      title: item.success === 1 ? `登录成功 · ${item.username}` : `登录失败 · ${item.username}`,
      detail: item.ip ?? '未知 IP',
      time: item.loginTime,
      success: item.success === 1,
    }))
    const operItems = (operQuery.data?.list ?? []).map((item) => ({
      id: `oper-${item.id}`,
      title: `${item.title ?? '后台操作'} · ${item.operName ?? '未知用户'}`,
      detail: item.businessType ?? '操作',
      time: item.operTime,
      success: item.status === 1,
    }))
    return [...loginItems, ...operItems]
      .sort((left, right) => right.time.localeCompare(left.time))
      .slice(0, 6)
  }, [loginQuery.data, operQuery.data])

  const auditRoute = findRoute(routes, ['操作日志', '登录日志'])

  return (
    <div className="w-full space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            {t('common.管理工作台', { defaultValue: '管理工作台' })}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('common.welcomeBack', {
              name: user?.nickname ?? user?.username ?? '',
              defaultValue: '欢迎回来，{{name}}',
            })}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('common.从这里进入系统管理能力，并查看最近的访问与操作记录。', {
              defaultValue: '从这里进入系统管理能力，并查看最近的访问与操作记录。',
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{roles.length} 个角色</Badge>
          <Badge variant="outline">{perms.length} 个权限点</Badge>
          <Badge variant="outline">{menuCount} 个菜单节点</Badge>
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid divide-y divide-border md:grid-cols-4 md:divide-x md:divide-y-0">
          {capabilities.map((capability) => {
            const Icon = capability.icon
            const route = findRoute(routes, capability.routeNames)
            const content = (
              <>
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground">
                    <Icon className="size-4" />
                  </span>
                  {route && <ArrowUpRight className="size-4 text-muted-foreground" />}
                </div>
                <h2 className="mt-5 text-sm font-semibold">{capability.label}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {capability.description}
                </p>
              </>
            )
            return route ? (
              <Link
                key={capability.label}
                to={route.path}
                data-slot="interactive-card"
                className="p-4 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:p-5"
              >
                {content}
              </Link>
            ) : (
              <div key={capability.label} className="p-4 opacity-60 sm:p-5">
                {content}
              </div>
            )
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-semibold">近期管理活动</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">登录与后台操作的合并视图</p>
            </div>
            {auditRoute && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={auditRoute.path}>
                  查看全部
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            )}
          </div>
          <div className="px-4 sm:px-5">
            {(loginQuery.isLoading || operQuery.isLoading) && <SectionSkeleton />}
            {!loginQuery.isLoading && !operQuery.isLoading && activity.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无可查看的活动记录</p>
            )}
            {activity.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-3 py-3.5',
                  index > 0 && 'border-t border-border',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 size-1.5 shrink-0 rounded-full',
                    item.success ? 'bg-primary' : 'bg-destructive',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(item.time)}
                </time>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">访问概览</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">当前管理视图</p>
              </div>
              <Radio className="size-4 text-muted-foreground" />
            </div>
            <dl className="mt-5 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-sm text-muted-foreground">在线会话</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {onlineQuery.isLoading ? '—' : (onlineQuery.data?.length ?? 0)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-sm text-muted-foreground">近期失败登录</dt>
                <dd
                  className={cn(
                    'text-lg font-semibold tabular-nums',
                    failedLogins > 0 && 'text-destructive',
                  )}
                >
                  {loginQuery.isLoading ? '—' : failedLogins}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">可访问页面</dt>
                <dd className="text-lg font-semibold tabular-nums">{routes.length}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">快捷操作</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {quickTargets.map((target) => {
                const route = findRoute(routes, [target.title])
                const Icon = target.icon
                if (!route) return null
                return (
                  <Button
                    key={target.title}
                    variant="outline"
                    className="h-auto justify-start py-3"
                    asChild
                  >
                    <Link to={route.path}>
                      <Icon className="size-4" />
                      {target.title.replace('管理', '')}
                    </Link>
                  </Button>
                )
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
