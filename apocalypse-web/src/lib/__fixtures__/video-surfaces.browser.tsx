/**
 * Dev-only fixture for the 2026-10-18 video adaptation: mounts one real surface per `?surface=`
 * (config | oper | dept | palette | page-transition) over a local Axios adapter.
 * No production import or backend.
 */
import { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'

import { AppProviders } from '@/app/providers'
import { PageTransition } from '@/components/PageTransition'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { http } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { ConfigWorkspace } from '@/views/system/config/ConfigWorkspace'
import { DeptOrgChart } from '@/views/system/dept/DeptOrgChart'
import type { DeptTreeNode } from '@/views/system/dept/types'
import OperLogPage from '@/views/system/log/oper'
import LoginLogPage from '@/views/system/log/login'
import OnlineUserPage from '@/views/system/online'
import PermissionPage from '@/views/system/permission'
import UserPage from '@/views/system/user'
import '@/index.css'

if (!import.meta.env.DEV) throw new Error('Video surfaces fixture is dev-only')
const params = new URLSearchParams(window.location.search)
const surface = params.get('surface') ?? 'config'
const permissions = [
  'system:config:list',
  'system:config:edit',
  'system:log:list',
  'system:log:login',
  'system:log:oper',
  'system:dept:list',
  'system:user:list',
  'system:user:edit',
  'system:role:list',
  'system:permission:list',
  'system:online:list',
  'system:online:kick',
]
useAuthStore.setState({
  tokens: null,
  user: {
    id: 'fixture-principal',
    username: params.has('self') ? 'alice' : 'fixture-operator',
    nickname: null,
  },
  sessionEpoch: 1,
  authorizationEpoch: 1,
  meLoaded: true,
  bootstrapped: true,
  authorizationSnapshotId: 'video-surfaces-fixture',
  authorizationDeadline: Number.POSITIVE_INFINITY,
  perms: permissions,
  allScopePerms: [],
  menus:
    surface === 'palette'
      ? ['user', 'permission'].map((kind, index) => ({
          id: `fixture-${kind}`,
          parentId: '0',
          menuName: kind,
          menuType: 'M' as const,
          path: `/system/${kind}`,
          component: `system/${kind}`,
          perms: null,
          moduleKey: null,
          icon: null,
          sort: index,
          children: [],
        }))
      : [],
})
useSettingsStore.setState({
  motionEnabled: !params.has('motionOff'),
  language: 'zh',
  theme: 'light',
})

const configs = [
  { id: 'c1', configKey: 'frame.theme', configName: '主题', configValue: 'light', remark: null },
  {
    id: 'c2',
    configKey: 'frame.density',
    configName: '密度',
    configValue: 'comfortable',
    remark: null,
  },
  {
    id: 'c3',
    configKey: 'account.captcha',
    configName: '验证码',
    configValue: 'false',
    remark: null,
  },
].map((row) => ({ ...row, version: 1 }))
if (params.has('manyConfigs'))
  configs.push(
    ...Array.from({ length: 203 }, (_, index) => ({
      id: `c${index + 4}`,
      configKey: `fixture.parameter${index + 4}`,
      configName: `参数 ${index + 4}`,
      configValue: `original-${index + 4}`,
      remark: null,
      version: 1,
    })),
  )
let saves = { count: 0, body: '', permissionModule: '' }
const userRows = Array.from({ length: 12 }, (_, index) => ({
  id: `u${index + 1}`,
  username: `account-${index + 1}`,
  nickname: `成员 ${index + 1}`,
  status: 1,
  deptId: 'fe',
  deptName: '前端组',
  createTime: '2026-10-18T09:00:00',
}))
let userDenied = false
const permissionRows = [
  { moduleKey: null, code: 'system:user:list', name: '读取用户' },
  { moduleKey: null, code: 'system:user:edit', name: '修改用户' },
  { moduleKey: null, code: 'system:role:list', name: '读取角色' },
  { moduleKey: 'calendar', code: 'calendar:day:list', name: '日历视图' },
  { moduleKey: 'calendar', code: 'calendar:day:read', name: '读取日期详情' },
].map((row, index) => ({
  ...row,
  id: `p${index + 1}`,
  resource: row.code.split(':')[1],
  action: row.code.split(':')[2],
  status: 1,
  lifecycle: 'ACTIVE',
  registered: true,
}))
const onlineRows = [
  { jti: 'j1', username: 'alice', ip: '10.0.0.1', loginTime: '2026-10-18 09:00:00' },
  { jti: 'j2', username: 'alice', ip: '10.0.0.2', loginTime: '2026-10-18 10:00:00' },
  { jti: 'j3', username: 'bob', ip: '10.0.0.1', loginTime: '2026-10-18 11:00:00' },
].map((row) => ({ ...row, userAgent: 'Mozilla/5.0 (Macintosh) Chrome/153' }))
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

const operRows = Array.from({ length: 3 }, (_, index) => ({
  id: `oper-${index + 1}`,
  title: `操作 ${index + 1}`,
  businessType: 'UPDATE',
  method: 'io.apocalypse.Fixture.update()',
  operName: 'fixture-operator',
  operIp: '127.0.0.1',
  operParam: '{"id":"7","name":"fixture"}',
  operResult: '{"code":0}',
  status: 1,
  errorMsg: null,
  operTime: '2026-10-18 12:00:00',
  costTime: 12,
}))
const loginRows = Array.from({ length: 25 }, (_, index) => ({
  id: `login-${index + 1}`,
  username: index % 2 ? 'alice' : 'bob',
  ip: '10.0.0.1',
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/153',
  success: index % 3 ? 1 : 0,
  message: index % 3 ? '登录成功' : '登录失败',
  loginTime: `2026-10-20 09:${String(index).padStart(2, '0')}:00`,
}))

const dept = (id: string, name: string, children: DeptTreeNode[] = []): DeptTreeNode => ({
  id,
  parentId: '0',
  deptName: name,
  leader: null,
  phone: null,
  sort: 0,
  status: 1,
  remark: null,
  children,
})
const tree = [
  dept('root', '总部', [
    dept('rd', '研发中心', [dept('fe', '前端组'), dept('be', '后端组')]),
    dept('ops', '运营中心', [dept('cs', '客服组')]),
  ]),
]

const overview = {
  evaluatedAt: '2026-10-18T12:00:00Z',
  usersVisible: true,
  userCount: 2,
  roleCount: 2,
  enabledRoleCount: 2,
  permissionCount: 1,
  navigationCount: 1,
  idleRoleCount: 1,
  idleRoles: [
    {
      roleId: 'role-idle',
      roleName: '闲置角色样例',
      roleKey: 'idle',
      status: 1,
      memberCount: 0,
      activeGrantCount: 0,
      reason: 'BOTH',
    },
  ],
  usersWithoutRolesCount: 0,
  usersWithoutRoles: [],
  unassignedNavigationCount: 0,
  unassignedNavigation: [],
  roleScopeDistribution: [],
  permissionModules: [
    { key: null, count: 3, enabled: true },
    { key: 'calendar', count: 2, enabled: false },
  ],
}

http.defaults.adapter = async (config) => {
  const path = config.url ?? ''
  const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
  let data: unknown
  if (path === '/system/configs/page') {
    const query = (config.params ?? {}) as Record<string, unknown>
    const page = Number(query.page ?? 1),
      size = Number(query.size ?? 10)
    const keyword = String(query.keyword ?? '')
      .trim()
      .toLowerCase()
    const rows = configs.filter(
      (row) => !keyword || `${row.configKey} ${row.configName}`.toLowerCase().includes(keyword),
    )
    data = {
      list: structuredClone(rows.slice((page - 1) * size, page * size)),
      total: rows.length,
      page,
      size,
    }
  } else if (path.startsWith('/system/configs/key/')) {
    const key = decodeURIComponent(path.slice('/system/configs/key/'.length))
    const row = configs.find((entry) => entry.configKey === key)
    if (!row)
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { code: 40400, message: '参数不存在' },
      }
    data = structuredClone(row)
  } else if (path === '/system/configs/values') {
    const items = (
      body as { items: { id: string; expectedVersion: number; configValue: string }[] }
    ).items
    saves = { ...saves, count: saves.count + 1, body: JSON.stringify(items) }
    notify()
    const stale = items.filter(
      (item) => configs.find((row) => row.id === item.id)?.version !== item.expectedVersion,
    )
    if (stale.length)
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: {
          code: 40900,
          message: `参数已被他人修改：${stale.map((item) => item.id).join('、')}`,
        },
      }
    for (const item of items) {
      const row = configs.find((entry) => entry.id === item.id)!
      row.configValue = item.configValue
      row.version++
    }
    data = structuredClone(configs.filter((row) => items.some((item) => item.id === row.id)))
  } else if (path === '/system/logs/login') {
    const query = (config.params ?? {}) as Record<string, unknown>
    const page = Number(query.page ?? 1),
      size = Number(query.size ?? 10)
    const keyword = String(query.keyword ?? '')
    const rows = loginRows.filter(
      (row) => !keyword || `${row.username} ${row.ip}`.includes(keyword),
    )
    saves = { ...saves, body: JSON.stringify(query) }
    notify()
    data = { list: rows.slice((page - 1) * size, page * size), total: rows.length, page, size }
  } else if (path === '/system/logs/login/heatmap' || path === '/system/logs/login/insights') {
    const range = String((config.params as Record<string, unknown>)?.range ?? 'WEEK')
    const cells = Array.from({ length: 168 }, (_, index) => ({
      isoWeekday: Math.floor(index / 24) + 1,
      hour: index % 24,
      total: index % 6,
      failed: index % 6 === 5 ? 3 : 0,
      slots: index === 0 ? 0 : 1,
    }))
    data = {
      range,
      bucketUnit: 'DAYS',
      zone: 'Asia/Shanghai',
      utcOffset: '+08:00',
      from: '2026-10-14 00:00:00',
      to: '2026-10-21 00:00:00',
      coveredFrom: '2026-10-14 00:00:00',
      retentionStart: '2026-10-01 00:00:00',
      total: 420,
      succeeded: 336,
      failed: 84,
      distinctUsers: 2,
      distinctIps: 1,
      maxCell: 5,
      previousCovered: true,
      previousTotal: 400,
      peak: 5,
      average: 2.5,
      buckets: [],
      cells,
    }
  } else if (path === '/system/logs/oper')
    data = { list: operRows, total: operRows.length, page: 1, size: 10 }
  else if (path === '/system/users/page') {
    if (surface !== 'user')
      data = {
        list: [{ id: 'u1', username: 'member', nickname: '成员一', status: 1, deptName: '前端组' }],
        total: 1,
        page: 1,
        size: 10,
      }
    else if (userDenied)
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { code: 40300, message: '账号范围已撤回' },
      }
    else {
      const query = (config.params ?? {}) as Record<string, unknown>
      const page = Number(query.page ?? 1)
      const size = Number(query.size ?? 10)
      const keyword = String(query.keyword ?? '')
      const rows = userRows.filter(
        (row) => !keyword || `${row.username} ${row.nickname}`.includes(keyword),
      )
      data = {
        list: structuredClone(rows.slice((page - 1) * size, page * size)),
        total: rows.length,
        page,
        size,
      }
    }
  } else if (path === '/system/users/department-options') data = tree
  else if (/^\/system\/users\/u\d+$/.test(path) && config.method === 'put') {
    const row = userRows.find((row) => path.endsWith(`/${row.id}`))!
    const changes = body as Partial<typeof row>
    Object.assign(row, changes)
    saves = { ...saves, count: saves.count + 1, body: JSON.stringify(changes) }
    notify()
    data = null
  } else if (path === '/system/authorization/insights/overview')
    data =
      surface === 'palette'
        ? {
            ...overview,
            usersWithoutRolesCount: 1,
            usersWithoutRoles: [{ id: 'u1', username: 'member', nickname: '成员一' }],
          }
        : overview
  else if (path === '/system/authorization/insights/permission-holders')
    data = {
      evaluatedAt: overview.evaluatedAt,
      permissionId: 'p1',
      code: 'system:user:list',
      name: '读取用户',
      moduleKey: null,
      status: 1,
      lifecycle: 'ACTIVE',
      moduleEnabled: true,
      membersVisible: true,
      outOfScopeVisible: false,
      activeRoleCount: 0,
      coveredVisibleUserCount: 0,
      roles: [],
    }
  else if (path === '/system/permissions/page') {
    const params = (config.params ?? {}) as Record<string, unknown>
    // Summary counts ask for size 1; the table asks for a page. Record the table's filter only.
    if (Number(params.size) > 1) {
      saves = { ...saves, permissionModule: String(params.moduleKey ?? '') }
      notify()
    }
    const rows = permissionRows.filter(
      (row) =>
        (!params.moduleKey || row.moduleKey === params.moduleKey) &&
        (params.status === undefined || String(row.status) === String(params.status)),
    )
    data = { list: rows, total: rows.length, page: 1, size: Number(params.size ?? 10) }
  } else if (path === '/system/online-users') data = structuredClone(onlineRows)
  else if (path.startsWith('/system/online-users/') && config.method === 'delete') {
    if (params.has('kickFail'))
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { code: 40900, message: '当前账号暂时不能强退' },
      }
    const target = onlineRows.find((row) => path.endsWith(`/${row.jti}`))
    if (!target)
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { code: 40400, message: '会话已结束' },
      }
    for (let index = onlineRows.length - 1; index >= 0; index--)
      if (onlineRows[index].username === target.username) onlineRows.splice(index, 1)
    saves = {
      ...saves,
      count: saves.count + 1,
      body: JSON.stringify({ username: target.username }),
    }
    notify()
    data = null
  } else if (path.startsWith('/system/dicts')) data = []
  else throw new Error(`Unexpected fixture request: ${path}`)
  return { status: 200, statusText: 'OK', headers: {}, config, data: { code: 0, data } }
}

function StatefulTransitionPage() {
  const [instance] = useState(() => crypto.randomUUID())
  const [draft, setDraft] = useState('')
  const [count, setCount] = useState(0)
  const [expanded, setExpanded] = useState(false)
  return (
    <section aria-label="Stateful page" className="space-y-4">
      <output data-testid="transition-state" data-instance={instance} data-count={count}>
        Local count: {count}
      </output>
      <label htmlFor="transition-draft">Unsaved draft</label>
      <input
        id="transition-draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Increment count
      </button>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        Expand record
      </button>
      {expanded && <p>Expanded record details</p>}
    </section>
  )
}

function PageTransitionFixture() {
  const location = useLocation()
  const navigate = useNavigate()
  const motionEnabled = useSettingsStore((state) => state.motionEnabled)
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <button
          type="button"
          aria-pressed={motionEnabled}
          onClick={() => useSettingsStore.getState().setMotionEnabled(true)}
        >
          Motion on
        </button>
        <button
          type="button"
          aria-pressed={!motionEnabled}
          onClick={() => useSettingsStore.getState().setMotionEnabled(false)}
        >
          Motion off
        </button>
        <button type="button" onClick={() => navigate('/fixture/page-transition/next')}>
          Navigate to next page
        </button>
      </div>
      <PageTransition key={location.pathname}>
        <StatefulTransitionPage />
      </PageTransition>
    </div>
  )
}

function Fixture() {
  const location = useLocation()
  const saved = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => saves,
  )
  const [paletteOpen, setPaletteOpen] = useState(true)
  return (
    <main
      className={`min-h-screen bg-background p-6 text-foreground ${params.has('narrow') ? 'max-w-xl' : ''}`}
    >
      <output
        data-testid="fixture-saves"
        data-count={saved.count}
        data-body={saved.body}
        data-permission-module={saved.permissionModule}
      />
      <output
        data-testid="fixture-navigation"
        data-path={location.pathname}
        data-state={JSON.stringify(location.state)}
      />
      <button
        type="button"
        onClick={() => {
          const row = configs.find((entry) => entry.id === 'c1')!
          row.configValue = 'dark'
          row.version++
        }}
      >
        Change theme elsewhere
      </button>
      {surface === 'config' && <ConfigWorkspace />}
      {surface === 'oper' && <OperLogPage />}
      {surface === 'loginlog' && <LoginLogPage />}
      {surface === 'online' && (
        <>
          <button
            type="button"
            onClick={() => {
              for (let index = onlineRows.length - 1; index >= 0; index--)
                if (onlineRows[index].username === 'alice') onlineRows.splice(index, 1)
            }}
          >
            Expire alice sessions
          </button>
          <OnlineUserPage />
        </>
      )}
      {surface === 'permission' && <PermissionPage />}
      {surface === 'user' && (
        <>
          <button
            type="button"
            onClick={() => {
              userDenied = true
            }}
          >
            Deny account scope
          </button>
          <UserPage />
        </>
      )}
      {surface === 'page-transition' && <PageTransitionFixture />}
      {surface === 'dept' && (
        <DeptOrgChart tree={tree} onCreateChild={() => {}} onEdit={() => {}} onDelete={() => {}} />
      )}
      {surface === 'palette' && (
        <>
          <button type="button" onClick={() => setPaletteOpen(true)}>
            Open palette
          </button>
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            onOpenSettings={() => {}}
          />
        </>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <MemoryRouter
      initialEntries={[
        {
          pathname: `/fixture/${surface}`,
          state: params.has('context')
            ? { workspaceContext: { kind: 'user', userId: 'u12', keyword: 'account-12' } }
            : null,
        },
      ]}
    >
      <Fixture />
    </MemoryRouter>
  </AppProviders>,
)
