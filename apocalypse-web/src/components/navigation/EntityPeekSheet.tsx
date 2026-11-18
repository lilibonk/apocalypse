import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarDays,
  KeyRound,
  LayoutList,
  Radio,
  ScrollText,
  Shield,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'
import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useNavigate } from 'react-router'

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
import { request } from '@/lib/api/client'
import type { PageResult, UserInfo } from '@/lib/api/types'
import { summarizeUserAgent } from '@/lib/user-agent'
import { useAuthStore } from '@/stores/auth'

import { buildEntityRouteTarget, type EntityKind, type EntityRouteIntent } from './entity-intent'
import { EntityPeekContext, type EntityPeekContextValue } from './entity-peek-context'

interface PeekTarget {
  intent: EntityRouteIntent
  authorizedPath: string | null
}

const KIND_META: Record<
  EntityKind,
  { label: string; destination: string; icon: ComponentType<{ className?: string }> }
> = {
  user: { label: '用户档案', destination: '用户管理', icon: UserRound },
  role: { label: '角色摘要', destination: '角色管理', icon: Shield },
  dept: { label: '组织部门', destination: '部门管理', icon: Building2 },
  permission: { label: '权限动作', destination: '权限目录', icon: KeyRound },
  menu: { label: '导航菜单', destination: '菜单管理', icon: LayoutList },
  session: { label: '在线会话', destination: '在线用户', icon: Radio },
  dict: { label: '字典类型', destination: '字典管理', icon: BookOpen },
  config: { label: '系统参数', destination: '参数设置', icon: SlidersHorizontal },
  calendar: { label: '日历上下文', destination: '万年历', icon: CalendarDays },
  'log-login': { label: '登录活动', destination: '登录日志', icon: Activity },
  'log-oper': { label: '操作审计', destination: '操作日志', icon: ScrollText },
}

interface RoleSummaryRow {
  id: string
  roleName: string
  roleKey: string
  status: number
  dataScope?: string | null
  sort?: number | null
  remark?: string | null
}

interface DeptTreeItem {
  id: string
  parentId: string
  deptName: string
  leader?: string | null
  phone?: string | null
  status: number
  remark?: string | null
  children?: DeptTreeItem[]
}

interface OnlineSessionRow {
  jti: string
  username: string
  ip: string | null
  userAgent: string | null
  loginTime: string
}

interface LoginLogPreviewRow {
  id: string
  username: string
  ip: string | null
  userAgent: string | null
  success: number
  message: string | null
  loginTime: string
}

interface PermissionSummaryRow {
  id: string
  code: string
  name: string
  moduleKey: string | null
  resource: string
  action: string
  status: number
  lifecycle: string
  referenceRoleCount?: number
  description?: string | null
}

function findDeptWithPath(
  nodes: readonly DeptTreeItem[],
  targetId: string,
  ancestors: string[] = [],
): { node: DeptTreeItem; path: string[] } | null {
  for (const node of nodes) {
    const nextPath = [...ancestors, node.deptName]
    if (String(node.id) === targetId) {
      return { node, path: nextPath }
    }
    if (node.children?.length) {
      const hit = findDeptWithPath(node.children, targetId, nextPath)
      if (hit) return hit
    }
  }
  return null
}

function EntityPeekBody({
  target,
  onSwitchTarget,
}: {
  target: PeekTarget
  onSwitchTarget: (intent: EntityRouteIntent) => void
}) {
  const perms = useAuthStore((state) => state.perms)
  const { intent } = target

  const canReadUser = perms.includes('system:user:list')
  const canReadRole = perms.includes('system:role:list')
  const canReadDept = perms.includes('system:dept:list')
  const canReadOnline = perms.includes('system:online:list')
  const canReadLoginLog = perms.includes('system:log:login')
  const canReadPermission = perms.includes('system:permission:list')

  const userQuery = useQuery({
    queryKey: ['entity-peek', 'user', intent.id, intent.label],
    enabled: intent.kind === 'user' && canReadUser,
    queryFn: async ({ signal }) => {
      if (/^\d+$/.test(intent.id)) {
        return request<UserInfo>(`/system/users/${intent.id}`, { signal })
      }
      const res = await request<PageResult<UserInfo>>('/system/users/page', {
        query: { page: 1, size: 5, keyword: intent.label || intent.id },
        signal,
      })
      return res.list.find((u) => u.username === intent.id) ?? res.list[0] ?? null
    },
  })

  const roleQuery = useQuery({
    queryKey: ['entity-peek', 'role', intent.id, intent.label],
    enabled: intent.kind === 'role' && canReadRole,
    queryFn: async ({ signal }) => {
      const res = await request<PageResult<RoleSummaryRow>>('/system/roles/page', {
        query: {
          page: 1,
          size: 20,
          keyword: intent.label || (/^\d+$/.test(intent.id) ? undefined : intent.id),
        },
        signal,
      })
      return (
        res.list.find((item) => String(item.id) === intent.id || item.roleKey === intent.id) ??
        res.list[0] ??
        null
      )
    },
  })

  const deptQuery = useQuery({
    queryKey: ['entity-peek', 'dept'],
    enabled: intent.kind === 'dept' && canReadDept,
    queryFn: ({ signal }) => request<DeptTreeItem[]>('/system/depts/tree', { signal }),
  })

  const sessionQuery = useQuery({
    queryKey: ['entity-peek', 'session', intent.id],
    enabled: intent.kind === 'session' && canReadOnline,
    queryFn: async ({ signal }) => {
      const list = await request<OnlineSessionRow[]>('/system/online-users', { signal })
      if (intent.id === 'list') return list.slice(0, 6)
      return list.filter((row) => row.username === intent.id || row.jti === intent.id)
    },
  })

  const loginLogQuery = useQuery({
    queryKey: ['entity-peek', 'log-login', intent.id],
    enabled: intent.kind === 'log-login' && canReadLoginLog,
    queryFn: ({ signal }) =>
      request<PageResult<LoginLogPreviewRow>>('/system/logs/login', {
        query: { page: 1, size: 6, keyword: intent.id === 'list' ? undefined : intent.id },
        signal,
      }),
  })

  const permissionQuery = useQuery({
    queryKey: ['entity-peek', 'permission', intent.id],
    enabled: intent.kind === 'permission' && canReadPermission,
    queryFn: async ({ signal }) => {
      const list = await request<PermissionSummaryRow[]>('/system/permissions', { signal })
      return list.find((item) => String(item.id) === intent.id || item.code === intent.id) ?? null
    },
  })

  if (intent.kind === 'user') {
    if (!canReadUser) {
      return (
        <p className="text-sm text-muted-foreground">
          当前账号缺少查看用户档案权限（system:user:list）。
        </p>
      )
    }
    if (userQuery.isPending) return <Skeleton className="h-36 w-full" />
    if (userQuery.isError || !userQuery.data) {
      return (
        <p className="text-sm text-muted-foreground">
          未找到匹配的用户档案，或目标不在当前授权数据范围内。
        </p>
      )
    }
    const u = userQuery.data
    const deptText =
      u.deptPath && u.deptPath.length > 0
        ? u.deptPath.map((node) => node.deptName).join(' / ')
        : u.deptName || '未分配部门'
    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 rounded-control border border-border-subtle bg-muted/25 p-3.5 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">用户名</dt>
            <dd className="mt-0.5 font-mono font-medium">{u.username}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">状态</dt>
            <dd className="mt-0.5">
              <Badge variant={u.status === 1 ? 'success' : 'secondary'}>
                {u.status === 1 ? '正常' : '停用'}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">昵称</dt>
            <dd className="mt-0.5 font-medium">{u.nickname || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">所属部门</dt>
            <dd className="mt-0.5">{deptText}</dd>
          </div>
        </dl>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            生效角色（{u.roles?.length ?? 0}）
          </p>
          {u.roles && u.roles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {u.roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    onSwitchTarget({
                      kind: 'role',
                      id: String(r.id),
                      label: r.roleName,
                    })
                  }
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-subtle bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:border-brand-text/45 hover:text-brand-text"
                >
                  <span>{r.roleName}</span>
                  <code className="font-mono text-[11px] text-muted-foreground">{r.roleKey}</code>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">暂未授予任何角色</p>
          )}
        </div>
      </div>
    )
  }

  if (intent.kind === 'role') {
    if (!canReadRole) {
      return (
        <p className="text-sm text-muted-foreground">
          当前账号缺少查看角色列表权限（system:role:list）。
        </p>
      )
    }
    if (roleQuery.isPending) return <Skeleton className="h-32 w-full" />
    if (roleQuery.isError || !roleQuery.data) {
      return <p className="text-sm text-muted-foreground">未能读取到角色定义摘要。</p>
    }
    const r = roleQuery.data
    return (
      <dl className="grid grid-cols-2 gap-3 rounded-control border border-border-subtle bg-muted/25 p-3.5 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">角色名称</dt>
          <dd className="mt-0.5 font-medium">{r.roleName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">角色标识</dt>
          <dd className="mt-0.5 font-mono text-xs">{r.roleKey}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">状态</dt>
          <dd className="mt-0.5">
            <Badge variant={r.status === 1 ? 'success' : 'secondary'}>
              {r.status === 1 ? '启用' : '停用'}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">默认数据范围</dt>
          <dd className="mt-0.5 font-mono text-xs">{r.dataScope || '未指定'}</dd>
        </div>
        {r.remark && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">说明</dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{r.remark}</dd>
          </div>
        )}
      </dl>
    )
  }

  if (intent.kind === 'dept') {
    if (!canReadDept) {
      return (
        <p className="text-sm text-muted-foreground">
          当前账号缺少查看部门树权限（system:dept:list）。
        </p>
      )
    }
    if (deptQuery.isPending) return <Skeleton className="h-32 w-full" />
    const hit = deptQuery.data ? findDeptWithPath(deptQuery.data, intent.id) : null
    if (!hit) {
      return <p className="text-sm text-muted-foreground">未在部门树中找到对应节点。</p>
    }
    return (
      <dl className="grid grid-cols-2 gap-3 rounded-control border border-border-subtle bg-muted/25 p-3.5 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">组织层级路径</dt>
          <dd className="mt-0.5 font-medium">{hit.path.join(' / ')}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">负责人</dt>
          <dd className="mt-0.5">{hit.node.leader || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">联系电话</dt>
          <dd className="mt-0.5 font-mono text-xs">{hit.node.phone || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">状态</dt>
          <dd className="mt-0.5">
            <Badge variant={hit.node.status === 1 ? 'success' : 'secondary'}>
              {hit.node.status === 1 ? '正常' : '停用'}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">直属子部门</dt>
          <dd className="mt-0.5 font-mono tabular-nums">{hit.node.children?.length ?? 0} 个</dd>
        </div>
      </dl>
    )
  }

  if (intent.kind === 'session') {
    if (!canReadOnline) {
      return (
        <p className="text-sm text-muted-foreground">
          当前账号缺少在线会话查看权限（system:online:list）。
        </p>
      )
    }
    if (sessionQuery.isPending) return <Skeleton className="h-32 w-full" />
    const sessions = sessionQuery.data ?? []
    if (sessions.length === 0) {
      return <p className="text-sm text-muted-foreground">当前没有活跃的在线会话。</p>
    }
    return (
      <ul className="divide-y divide-border-subtle rounded-control border border-border-subtle">
        {sessions.map((s) => (
          <li key={s.jti} className="space-y-1 px-3 py-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{summarizeUserAgent(s.userAgent)}</span>
              <span className="font-mono text-muted-foreground">{s.ip || '未知 IP'}</span>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              @{s.username} · {s.loginTime.replace('T', ' ')}
            </p>
          </li>
        ))}
      </ul>
    )
  }

  if (intent.kind === 'log-login') {
    if (!canReadLoginLog) {
      return (
        <p className="text-sm text-muted-foreground">
          当前账号缺少登录日志查看权限（system:log:login）。
        </p>
      )
    }
    if (loginLogQuery.isPending) return <Skeleton className="h-40 w-full" />
    const logs = loginLogQuery.data?.list ?? []
    if (logs.length === 0) {
      return <p className="text-sm text-muted-foreground">暂无近期登录记录。</p>
    }
    return (
      <ul className="divide-y divide-border-subtle rounded-control border border-border-subtle">
        {logs.map((row) => (
          <li key={row.id} className="space-y-1 px-3 py-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">
                {row.username} · {row.ip || '—'}
              </span>
              <Badge variant={row.success === 1 ? 'success' : 'destructive'}>
                {row.success === 1 ? '成功' : '失败'}
              </Badge>
            </div>
            <p className="truncate text-muted-foreground">
              {row.message || '—'} · {summarizeUserAgent(row.userAgent)}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {row.loginTime.replace('T', ' ')}
            </p>
          </li>
        ))}
      </ul>
    )
  }

  if (intent.kind === 'permission') {
    if (!canReadPermission) {
      return (
        <p className="text-sm text-muted-foreground">
          当前账号缺少权限目录查看权限（system:permission:list）。
        </p>
      )
    }
    if (permissionQuery.isPending) return <Skeleton className="h-32 w-full" />
    const perm = permissionQuery.data
    if (!perm) return <p className="text-sm text-muted-foreground">未找到对应权限动作定义。</p>
    return (
      <dl className="grid grid-cols-2 gap-3 rounded-control border border-border-subtle bg-muted/25 p-3.5 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">动作编码</dt>
          <dd className="mt-0.5 font-mono text-xs">{perm.code}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">生命周期</dt>
          <dd className="mt-0.5">
            <Badge variant="outline">{perm.lifecycle}</Badge>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">引用角色数</dt>
          <dd className="mt-0.5 font-mono tabular-nums">{perm.referenceRoleCount ?? 0}</dd>
        </div>
        {perm.description && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">说明</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{perm.description}</dd>
          </div>
        )}
      </dl>
    )
  }

  return (
    <div className="rounded-control border border-border-subtle bg-muted/25 p-3.5 text-sm text-muted-foreground">
      已锁定目标对象 <code className="font-mono text-foreground">{intent.label || intent.id}</code>
      。可在下方按需前往「{KIND_META[intent.kind].destination}」查看完整列表与操作上下文。
    </div>
  )
}

/**
 * 全局原位实体速览容器（EntityPeekProvider + Sheet）：
 * 将各业务域内的 `<EntityPeekLink>` 点击统一收敛为「右侧滑入快速摘要抽屉」，
 * 保持当前工作流与筛选上下文不丢失；用户确需深度编辑时再点击抽屉底部的次级跳转按钮。
 */
export function EntityPeekProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [target, setTarget] = useState<PeekTarget | null>(null)

  const openPeek = useCallback((intent: EntityRouteIntent, authorizedPath: string | null) => {
    setTarget({ intent, authorizedPath })
  }, [])

  const closePeek = useCallback(() => setTarget(null), [])

  const value = useMemo<EntityPeekContextValue>(
    () => ({ openPeek, closePeek }),
    [openPeek, closePeek],
  )

  const meta = target ? KIND_META[target.intent.kind] : null
  const Icon = meta?.icon

  return (
    <EntityPeekContext.Provider value={value}>
      {children}
      <Sheet open={target !== null} onOpenChange={(open) => !open && closePeek()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {target && meta && Icon && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-3.5 text-brand-text" aria-hidden="true" />
                  <span>原位速览 · {meta.label}</span>
                </div>
                <SheetTitle>{target.intent.label || target.intent.id}</SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {target.intent.id}
                </SheetDescription>
              </SheetHeader>

              <div className="px-6 py-4">
                <EntityPeekBody
                  target={target}
                  onSwitchTarget={(nextIntent) =>
                    setTarget((prev) => (prev ? { ...prev, intent: nextIntent } : prev))
                  }
                />
              </div>

              {target.authorizedPath && (
                <SheetFooter>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => {
                      const dest = buildEntityRouteTarget(target.authorizedPath!, target.intent)
                      closePeek()
                      navigate(
                        { pathname: dest.pathname, search: dest.search },
                        { state: dest.state },
                      )
                    }}
                  >
                    <span>前往「{meta.destination}」深入管理</span>
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Button>
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </EntityPeekContext.Provider>
  )
}
