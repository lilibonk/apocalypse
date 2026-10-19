/** Dev-only real RolePage + Axios fixture; no production import or backend connection. */
import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { AppProviders } from '@/app/providers'
import { http } from '@/lib/api/client'
import { startBrowserSessionSync, useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import RolePage from '@/views/system/role'
import type { PermissionDefinition } from '@/views/system/permission/permission.types'
import type { RoleGrant, RoleGrantsBaseline } from '@/views/system/role/role-grant.model'
import '@/index.css'

if (!import.meta.env.DEV) throw new Error('Role resize fixture is dev-only')
const focusEnabled = new URLSearchParams(window.location.search).has('focus')
const overviewEntry = new URLSearchParams(window.location.search).has('overview')
const principal = { id: 'fixture-principal', username: 'fixture-operator', nickname: null }
let narrowerSnapshot = false
const permissions = [
  'system:role:list',
  'system:role:edit',
  'system:menu:list',
  'system:permission:list',
  'system:user:list',
]
useAuthStore.setState({
  tokens: focusEnabled
    ? {
        accessToken: 'fixture-only-access',
        refreshToken: null,
        expiresIn: 3600,
        tokenType: 'Bearer',
      }
    : null,
  user: principal,
  sessionEpoch: 1,
  authorizationEpoch: 1,
  meLoaded: true,
  bootstrapped: true,
  authorizationSnapshotId: 'role-resize-fixture',
  authorizationDeadline: Number.POSITIVE_INFINITY,
  perms: permissions,
  allScopePerms: ['system:role:edit'],
})
useSettingsStore.setState({ motionEnabled: false, language: 'zh', theme: 'light' })
const role = {
  id: 'role-1',
  roleName: 'Resize role',
  roleKey: 'resize',
  dataScope: 'DEPT',
  status: 1,
  sort: 0,
  remark: null,
  authorizationRevision: '12',
}
const definition: PermissionDefinition = {
  id: 'permission-1',
  code: 'system:user:list',
  name: '读取用户',
  description: null,
  moduleKey: null,
  resource: 'user',
  action: 'list',
  status: 1,
  lifecycle: 'ACTIVE',
  version: 1,
  supportedScopeOverrides: ['INHERIT_ROLE', 'ALL', 'DEPT', 'DEPT_AND_CHILDREN'],
  declarationSource: 'Fixture',
  registered: true,
  referenceRoleCount: '0',
}
const baseline: RoleGrantsBaseline = {
  roleId: role.id,
  revision: '12',
  catalogRevision: '9',
  grants: [],
}
const candidate = { id: 'user-1', username: 'resize-user', nickname: 'Resize member', status: 1 }
let navigationIds: string[] = []
let userIds: string[] = []
let writes = { permissions: 0, navigation: 0, members: 0, body: '', meReads: 0 }
const listeners = new Set<() => void>()
function record(kind: 'permissions' | 'navigation' | 'members', body: unknown) {
  writes = { ...writes, [kind]: writes[kind] + 1, body: JSON.stringify(body) }
  listeners.forEach((listener) => listener())
}
http.defaults.adapter = async (config) => {
  const path = config.url ?? ''
  const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
  let data: unknown
  if (path === '/system/users/me') {
    writes = { ...writes, meReads: writes.meReads + 1 }
    listeners.forEach((listener) => listener())
    data = {
      user: principal,
      roles: ['fixture-operator'],
      perms: [...permissions],
      menus: [],
      allScopePerms: narrowerSnapshot ? [] : ['system:role:edit'],
      authorizationSnapshotId: narrowerSnapshot
        ? 'role-resize-fixture-dept'
        : 'role-resize-fixture',
      evaluatedAt: new Date(Date.UTC(2026, 9, 18, 12, writes.meReads)).toISOString(),
      nextTransitionAt: null,
    }
  } else if (path === '/system/roles/page')
    data = { list: [role], total: 1, page: 1, size: Number(config.params.size) }
  else if (path === '/system/roles/role-1/permissions') {
    if (config.method === 'put') {
      const change = body as { upsert: RoleGrant[]; remove: string[] }
      baseline.grants = [
        ...baseline.grants.filter(
          (grant) =>
            !change.remove.includes(grant.permissionId) &&
            !change.upsert.some((next) => next.permissionId === grant.permissionId),
        ),
        ...change.upsert.map((grant) => ({ ...grant, definition })),
      ]
      record('permissions', body)
    }
    data = structuredClone(baseline)
  } else if (path === '/system/permissions/page')
    data = { list: [definition], total: 1, page: 1, size: 4 }
  else if (path === '/system/menus/tree')
    data = [
      {
        id: 'navigation-1',
        parentId: '0',
        menuName: '用户导航',
        type: 'M',
        path: '/system/user',
        component: 'system/user/index',
        sort: 0,
        status: 1,
        visible: 1,
        children: [],
      },
    ]
  else if (path === '/system/roles/role-1/navigation') {
    if (config.method === 'put') {
      const change = body as { addIds: string[]; removeIds: string[] }
      navigationIds = [
        ...new Set([
          ...navigationIds.filter((id) => !change.removeIds.includes(id)),
          ...change.addIds,
        ]),
      ]
      record('navigation', body)
    }
    data = { roleId: role.id, revision: '12', navigationIds }
  } else if (path === '/system/roles/role-1/user-ids') data = userIds
  else if (path === '/system/roles/role-1/users') {
    if (config.method === 'put') {
      userIds = body as string[]
      record('members', body)
    }
    data = {
      list: userIds.includes(candidate.id) ? [candidate] : [],
      total: userIds.length,
      page: 1,
      size: 4,
    }
  } else if (path === '/system/users/page') data = { list: [candidate], total: 1, page: 1, size: 4 }
  else if (path === '/system/authorization/insights/overview')
    data = {
      evaluatedAt: '2026-10-18T12:00:00Z',
      usersVisible: true,
      userCount: 1,
      roleCount: 1,
      enabledRoleCount: 1,
      permissionCount: 1,
      navigationCount: 1,
      idleRoleCount: 0,
      idleRoles: [],
      usersWithoutRolesCount: 0,
      usersWithoutRoles: [],
      unassignedNavigationCount: 1,
      unassignedNavigation: [
        {
          menuId: 'navigation-1',
          menuName: '用户导航',
          menuType: 'M',
          parentId: '0',
          path: '/system/user',
          moduleKey: null,
          moduleEnabled: true,
        },
      ],
      roleScopeDistribution: [{ key: 'DEPT', count: 1, enabled: true }],
      permissionModules: [{ key: null, count: 1, enabled: true }],
    }
  else if (path.startsWith('/system/dicts')) data = []
  else throw new Error(`Unexpected fixture request: ${path}`)
  return { status: 200, statusText: 'OK', headers: {}, config, data: { code: 0, data } }
}
if (focusEnabled) startBrowserSessionSync()

function Fixture() {
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const snapshotId = useAuthStore((state) => state.authorizationSnapshotId)
  const loaded = useAuthStore((state) => state.meLoaded)
  const canWrite = useAuthStore((state) => state.allScopePerms.includes('system:role:edit'))
  const saved = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => writes,
  )
  return (
    <>
      <output
        data-testid="resize-writes"
        data-permissions={saved.permissions}
        data-navigation={saved.navigation}
        data-members={saved.members}
        data-body={saved.body}
        data-me-reads={saved.meReads}
        data-epoch={epoch}
        data-snapshot={snapshotId}
        data-loaded={loaded}
        data-can-write={canWrite}
      />
      <button
        type="button"
        onClick={() =>
          useAuthStore.setState((state) => ({
            authorizationEpoch: state.authorizationEpoch + 1,
            meLoaded: false,
            perms: [],
            allScopePerms: [],
            authorizationDeadline: 0,
          }))
        }
      >
        Invalidate authorization
      </button>
      {focusEnabled && (
        <button
          type="button"
          onClick={() => {
            narrowerSnapshot = true
          }}
        >
          Return narrower snapshot on next focus
        </button>
      )}
      <RolePage />
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <MemoryRouter
      initialEntries={[
        overviewEntry
          ? '/system/role'
          : `/system/role?roleId=${role.id}&roleKey=${role.roleKey}&roleRelation=permissions`,
      ]}
    >
      <Fixture />
    </MemoryRouter>
  </AppProviders>,
)
