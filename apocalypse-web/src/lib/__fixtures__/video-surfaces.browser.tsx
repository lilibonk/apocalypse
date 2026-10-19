/**
 * Dev-only fixture for the 2026-10-18 video adaptation: mounts one real surface per `?surface=`
 * (config | oper | dept | palette) over a local Axios adapter. No production import or backend.
 */
import { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'

import { AppProviders } from '@/app/providers'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { http } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { ConfigWorkspace } from '@/views/system/config/ConfigWorkspace'
import { DeptOrgChart } from '@/views/system/dept/DeptOrgChart'
import type { DeptTreeNode } from '@/views/system/dept/types'
import OperLogPage from '@/views/system/log/oper'
import OnlineUserPage from '@/views/system/online'
import PermissionPage from '@/views/system/permission'
import '@/index.css'

if (!import.meta.env.DEV) throw new Error('Video surfaces fixture is dev-only')
const params = new URLSearchParams(window.location.search)
const surface = params.get('surface') ?? 'config'
const permissions = [
  'system:config:list',
  'system:config:edit',
  'system:log:list',
  'system:dept:list',
  'system:user:list',
  'system:role:list',
  'system:permission:list',
  'system:online:list',
  'system:online:kick',
]
useAuthStore.setState({
  tokens: null,
  user: { id: 'fixture-principal', username: 'fixture-operator', nickname: null },
  sessionEpoch: 1,
  authorizationEpoch: 1,
  meLoaded: true,
  bootstrapped: true,
  authorizationSnapshotId: 'video-surfaces-fixture',
  authorizationDeadline: Number.POSITIVE_INFINITY,
  perms: permissions,
  allScopePerms: [],
  menus: [],
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
let saves = { count: 0, body: '', permissionModule: '' }
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
  if (path === '/system/configs/page')
    data = { list: structuredClone(configs), total: configs.length, page: 1, size: 200 }
  else if (path === '/system/configs/values') {
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
    data = configs.filter((row) => items.some((item) => item.id === row.id))
  } else if (path === '/system/logs/oper')
    data = { list: operRows, total: operRows.length, page: 1, size: 10 }
  else if (path === '/system/users/page')
    data = {
      list: [{ id: 'u1', username: 'member', nickname: '成员一', status: 1, deptName: '前端组' }],
      total: 1,
      page: 1,
      size: 10,
    }
  else if (path === '/system/authorization/insights/overview') data = overview
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
  } else if (path === '/system/online-users') data = onlineRows
  else if (path.startsWith('/system/dicts')) data = []
  else throw new Error(`Unexpected fixture request: ${path}`)
  return { status: 200, statusText: 'OK', headers: {}, config, data: { code: 0, data } }
}

function Fixture() {
  const saved = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => saves,
  )
  const [paletteOpen, setPaletteOpen] = useState(true)
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <output
        data-testid="fixture-saves"
        data-count={saved.count}
        data-body={saved.body}
        data-permission-module={saved.permissionModule}
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
      {surface === 'online' && <OnlineUserPage />}
      {surface === 'permission' && <PermissionPage />}
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
    <MemoryRouter initialEntries={[`/fixture/${surface}`]}>
      <Fixture />
    </MemoryRouter>
  </AppProviders>,
)
