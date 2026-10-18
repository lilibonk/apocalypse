import { QueryClient } from '@tanstack/react-query'
import { CanceledError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createRolePermissionQuery,
  createRoleChoicesQuery,
  createRoleMenuDraftQuery,
  createRoleMembersQuery,
  createRoleMemberDraftQuery,
  createRoleMemberCandidatesQuery,
  ROLE_CHOICES_PAGE_SIZE,
  ROLE_MEMBERS_PAGE_SIZE,
} from './role-permission.queries'
import type { RawRoleMenu, RolePermissionOpening } from './role-permission.model'

const { auth, request, listeners } = vi.hoisted(() => ({
  auth: {
    authorizationEpoch: 1,
    get allScopePerms() {
      return this.perms
    },
    sessionEpoch: 4,
    meLoaded: true,
    perms: ['system:role:list', 'system:menu:list'],
  },
  request: vi.fn(),
  listeners: new Set<
    (state: {
      sessionEpoch: number
      meLoaded: boolean
      perms: string[]
      authorizationEpoch: number
      allScopePerms: string[]
    }) => void
  >(),
}))
vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    epoch === undefined || epoch === auth.authorizationEpoch,
  assertAuthorizationCurrent: () => undefined,
  useAuthStore: {
    getState: () => auth,
    subscribe: (listener: (state: typeof auth) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  },
}))
vi.mock('@/lib/api/client', () => ({
  request,
  captureRequestContext: () => {
    const principalEpoch = auth.sessionEpoch
    return {
      principalEpoch,
      scoped: false,
      assertCurrent: () => {
        if (auth.sessionEpoch !== principalEpoch) throw new CanceledError('Identity changed')
      },
    }
  },
}))

const opening: RolePermissionOpening = {
  role: {
    id: '9223372036854775801',
    roleName: 'A role',
    roleKey: 'a',
    status: 1,
    dataScope: 'ALL',
  },
  openId: 'opening-one',
  principalEpoch: 4,
}
const tree: RawRoleMenu[] = [
  {
    id: '100',
    parentId: '0',
    menuName: 'Users',
    type: 'M',
    perms: 'system:user:list',
    icon: null,
    component: null,
    path: null,
    sort: 0,
  },
]
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
  auth.sessionEpoch = 4
  auth.meLoaded = true
  auth.perms = ['system:role:list', 'system:menu:list']
  request.mockReset()
  listeners.clear()
})

describe('role permission private query lifecycle', () => {
  it('uses actual role search and pagination parameters without truncating the collection', async () => {
    request.mockResolvedValue({
      list: [opening.role],
      total: 205,
      page: 3,
      size: ROLE_CHOICES_PAGE_SIZE,
    })
    const cache = client()
    const params = { page: 3, keyword: 'reviewer', principalEpoch: 4, openId: 'workspace' }
    const resource = createRoleChoicesQuery(params)
    const data = await cache.fetchQuery(resource.options)
    expect(request.mock.calls[0]![0]).toBe('/system/roles/page')
    expect(request.mock.calls[0]![1].query).toEqual({
      page: 3,
      size: ROLE_CHOICES_PAGE_SIZE,
      keyword: 'reviewer',
    })
    expect(data.total).toBe(205)
    expect(createRoleChoicesQuery({ ...params, page: 4 }).options.queryKey).not.toEqual(
      resource.options.queryKey,
    )
    expect(createRoleChoicesQuery({ ...params, keyword: 'another' }).options.queryKey).not.toEqual(
      resource.options.queryKey,
    )
    cache.clear()
  })

  it('loads role choices with role:list without requiring menu definition access', async () => {
    auth.perms = ['system:role:list']
    request.mockResolvedValue({
      list: [opening.role],
      total: 1,
      page: 1,
      size: ROLE_CHOICES_PAGE_SIZE,
    })
    const cache = client()
    const result = await cache.fetchQuery(
      createRoleChoicesQuery({ page: 1, keyword: '', principalEpoch: 4, openId: 'workspace' })
        .options,
    )
    expect(result.list).toEqual([opening.role])
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/system/roles/page'])
    cache.clear()
  })

  it('does not load workspace data without role:list', async () => {
    auth.perms = ['system:menu:list']
    const cache = client()
    await expect(
      cache.fetchQuery(
        createRoleChoicesQuery({ page: 1, keyword: '', principalEpoch: 4, openId: 'workspace' })
          .options,
      ),
    ).rejects.toBeInstanceOf(CanceledError)
    await expect(
      cache.fetchQuery(createRoleMembersQuery(opening, 1).options),
    ).rejects.toBeInstanceOf(CanceledError)
    expect(request).not.toHaveBeenCalled()
    cache.clear()
  })

  it('reads one visible member page with its own query identity and only role:list', async () => {
    auth.perms = ['system:role:list']
    const page = {
      list: [{ id: '9223372036854775802', username: 'visible-member', nickname: null, status: 1 }],
      total: 9,
      page: 2,
      size: ROLE_MEMBERS_PAGE_SIZE,
    }
    request.mockResolvedValue(page)
    const cache = client()
    const resource = createRoleMembersQuery(opening, 2)
    expect(await cache.fetchQuery(resource.options)).toEqual(page)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![0]).toBe(`/system/roles/${opening.role.id}/users`)
    expect(request.mock.calls[0]![1].query).toEqual({ page: 2, size: ROLE_MEMBERS_PAGE_SIZE })
    expect(createRoleMembersQuery(opening, 3).options.queryKey).not.toEqual(
      resource.options.queryKey,
    )
    cache.clear()
  })

  it('uses the complete edit baseline endpoint and preserves IDs without profile data', async () => {
    auth.perms = ['system:role:list', 'system:role:edit']
    const ids = ['9223372036854775802', '9223372036854775806']
    request.mockResolvedValue(ids)
    const cache = client()
    const resource = createRoleMemberDraftQuery(opening)
    expect(await cache.fetchQuery(resource.options)).toEqual(ids)
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      `/system/roles/${opening.role.id}/user-ids`,
    ])
    expect(request.mock.calls[0]![1].query).toBeUndefined()
    expect(
      createRoleMemberDraftQuery({ ...opening, openId: 'new-editor' }).options.queryKey,
    ).not.toEqual(resource.options.queryKey)
    cache.clear()
  })

  it('requires role edit permission for the full baseline and separately gates candidate profiles', async () => {
    const cache = client()
    auth.perms = ['system:role:list']
    await expect(
      cache.fetchQuery(createRoleMemberDraftQuery(opening).options),
    ).rejects.toBeInstanceOf(CanceledError)
    auth.perms = ['system:role:list', 'system:role:edit']
    await expect(
      cache.fetchQuery(createRoleMemberCandidatesQuery(opening, { page: 1, keyword: '' }).options),
    ).rejects.toBeInstanceOf(CanceledError)
    expect(request).not.toHaveBeenCalled()
    cache.clear()
  })

  it('uses the existing paginated user search without treating it as the assignment baseline', async () => {
    auth.perms = ['system:role:list', 'system:role:edit', 'system:user:list']
    const page = {
      list: [{ id: '42', username: 'reader', nickname: null, status: 1 }],
      total: 21,
      page: 3,
      size: 4,
    }
    request.mockResolvedValue(page)
    const cache = client()
    const resource = createRoleMemberCandidatesQuery(opening, { page: 3, keyword: 'read' })
    expect(await cache.fetchQuery(resource.options)).toEqual(page)
    expect(request.mock.calls[0]![0]).toBe('/system/users/page')
    expect(request.mock.calls[0]![1].query).toEqual({
      page: 3,
      size: ROLE_MEMBERS_PAGE_SIZE,
      keyword: 'read',
    })
    expect(resource.options.queryKey).not.toEqual(
      createRoleMemberDraftQuery(opening).options.queryKey,
    )
    cache.clear()
  })

  it('never publishes candidate profiles after user:list is revoked and rapidly restored', async () => {
    auth.perms = ['system:role:list', 'system:role:edit', 'system:user:list']
    const response = deferred<{
      list: { id: string; username: string; nickname: null; status: number }[]
      total: number
      page: number
      size: number
    }>()
    request.mockReturnValue(response.promise)
    const cache = client()
    const resource = createRoleMemberCandidatesQuery(opening, { page: 1, keyword: '' })
    const pending = cache.fetchQuery(resource.options)
    const rejected = expect(pending).rejects.toBeInstanceOf(CanceledError)
    auth.perms = ['system:role:list', 'system:role:edit']
    listeners.forEach((listener) => listener(auth))
    auth.perms.push('system:user:list')
    listeners.forEach((listener) => listener(auth))
    response.resolve({
      list: [{ id: '42', username: 'private-name', nickname: null, status: 1 }],
      total: 1,
      page: 1,
      size: 4,
    })
    await rejected
    expect(cache.getQueryData(resource.options.queryKey)).toBeUndefined()
    expect(request.mock.calls[0]![1].signal.aborted).toBe(true)
    cache.clear()
  })

  it('returns the complete menu draft baseline including unresolved and disabled definitions', async () => {
    const definitions = [{ ...tree[0]!, status: 0, visible: 0, moduleKey: 'calendar' }]
    const assigned = ['100', '9223372036854775806']
    request.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/system/menus/tree' ? definitions : { revision: '12', navigationIds: assigned },
      ),
    )
    const cache = client()
    const resource = createRoleMenuDraftQuery(opening)
    expect(await cache.fetchQuery(resource.options)).toEqual({
      tree: definitions.map((node) => ({ ...node, perms: null, children: [] })),
      revision: '12',
      menuIds: assigned,
    })
    expect(resource.options.queryKey).not.toEqual(
      createRolePermissionQuery(opening).options.queryKey,
    )
    expect(request.mock.calls[0]![1].signal).toBe(request.mock.calls[1]![1].signal)
    cache.clear()
  })

  it('does not publish a late role page after its workspace is closed or its identity changes', async () => {
    const pending = deferred<{
      list: (typeof opening.role)[]
      total: number
      page: number
      size: number
    }>()
    request.mockReturnValue(pending.promise)
    const cache = client()
    const resource = createRoleChoicesQuery({
      page: 1,
      keyword: '',
      principalEpoch: 4,
      openId: 'workspace',
    })
    const result = cache.fetchQuery(resource.options)
    const rejected = expect(result).rejects.toBeInstanceOf(CanceledError)
    resource.deactivate()
    auth.sessionEpoch++
    pending.resolve({ list: [opening.role], total: 1, page: 1, size: ROLE_CHOICES_PAGE_SIZE })
    await rejected
    expect(cache.getQueryData(resource.options.queryKey)).toBeUndefined()
    cache.clear()
  })

  it('does not send either request when one required permission is missing', async () => {
    auth.perms = ['system:role:list']
    const cache = client()
    await expect(
      cache.fetchQuery(createRolePermissionQuery(opening).options),
    ).rejects.toBeInstanceOf(CanceledError)
    expect(request).not.toHaveBeenCalled()
    cache.clear()
  })

  it('loads both actual endpoints with the same cancellation signal and only publishes a complete projection', async () => {
    request.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/system/menus/tree' ? tree : { revision: '12', navigationIds: ['100'] },
      ),
    )
    const cache = client()
    const result = await cache.fetchQuery(createRolePermissionQuery(opening).options)
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/system/menus/tree',
      '/system/roles/9223372036854775801/navigation',
    ])
    expect(request.mock.calls[0]![1].signal).toBe(request.mock.calls[1]![1].signal)
    expect(result.assignedCount).toBe(1)
    expect(result.permissionSources).toEqual([])
    expect(result.byId.get('100')?.perms).toBeNull()
    cache.clear()
  })

  it.each(['permission', 'identity', 'close'] as const)(
    'rejects a late result after %s changes',
    async (change) => {
      const ids = deferred<{ revision: string; navigationIds: string[] }>()
      request.mockImplementation((path: string) =>
        path === '/system/menus/tree' ? Promise.resolve(tree) : ids.promise,
      )
      const cache = client()
      const resource = createRolePermissionQuery(opening)
      const promise = cache.fetchQuery(resource.options)
      const rejected = expect(promise).rejects.toBeInstanceOf(CanceledError)
      if (change === 'permission') auth.perms = ['system:role:list']
      else if (change === 'identity') auth.sessionEpoch++
      else resource.deactivate()
      ids.resolve({ revision: '12', navigationIds: ['100'] })
      await rejected
      expect(cache.getQueryData(resource.options.queryKey)).toBeUndefined()
      cache.clear()
    },
  )

  it('allows a same-stack StrictMode reactivation without disposing the valid in-flight query', async () => {
    const ids = deferred<{ revision: string; navigationIds: string[] }>()
    request.mockImplementation((path: string) =>
      path === '/system/menus/tree' ? Promise.resolve(tree) : ids.promise,
    )
    const resource = createRolePermissionQuery(opening)
    const cache = client()
    const promise = cache.fetchQuery(resource.options)
    resource.deactivate()
    resource.activate()
    expect(resource.disposeIfInactive()).toBe(false)
    ids.resolve({ revision: '12', navigationIds: ['100'] })
    expect((await promise).assignedCount).toBe(1)
    cache.clear()
  })

  it('does not revive a pending response when a revoked permission is quickly granted again', async () => {
    const ids = deferred<{ revision: string; navigationIds: string[] }>()
    request.mockImplementation((path: string) =>
      path === '/system/menus/tree' ? Promise.resolve(tree) : ids.promise,
    )
    const cache = client()
    const resource = createRolePermissionQuery(opening)
    const promise = cache.fetchQuery(resource.options)
    const rejected = expect(promise).rejects.toBeInstanceOf(CanceledError)
    auth.perms = ['system:role:list']
    listeners.forEach((listener) => listener(auth))
    auth.perms = ['system:role:list', 'system:menu:list']
    listeners.forEach((listener) => listener(auth))
    ids.resolve({ revision: '12', navigationIds: ['100'] })
    await rejected
    expect(request.mock.calls[0]![1].signal.aborted).toBe(true)
    expect(cache.getQueryData(resource.options.queryKey)).toBeUndefined()
    expect(listeners.size).toBe(0)
    cache.clear()
  })

  it('aborts both request signals when the private query is cancelled', async () => {
    const pending = deferred<string[]>()
    request.mockReturnValue(pending.promise)
    const cache = client()
    const resource = createRolePermissionQuery(opening)
    const promise = cache.fetchQuery(resource.options)
    const rejected = expect(promise).rejects.toBeDefined()
    resource.deactivate()
    expect(resource.disposeIfInactive()).toBe(true)
    await cache.cancelQueries(resource.filter, { revert: false })
    cache.removeQueries(resource.filter)
    await rejected
    expect(request.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true)
    expect(cache.getQueryCache().findAll(resource.filter)).toEqual([])
    pending.resolve([])
    cache.clear()
  })

  it('never publishes partial inputs and aborts the sibling request when an endpoint fails', async () => {
    const failed = deferred<string[]>()
    request.mockImplementation((path: string) =>
      path === '/system/menus/tree' ? Promise.resolve(tree) : failed.promise,
    )
    const cache = client()
    const resource = createRolePermissionQuery(opening)
    const promise = cache.fetchQuery(resource.options)
    const rejected = expect(promise).rejects.toThrow('denied')
    failed.reject(new Error('denied'))
    await rejected
    expect(cache.getQueryData(resource.options.queryKey)).toBeUndefined()
    expect(request.mock.calls[0]![1].signal.aborted).toBe(true)
    cache.clear()
  })

  it('gives reopened and other-role requests different cache identities', () => {
    const first = createRolePermissionQuery(opening).options.queryKey
    expect(
      createRolePermissionQuery({ ...opening, openId: 'opening-two' }).options.queryKey,
    ).not.toEqual(first)
    expect(
      createRolePermissionQuery({ ...opening, role: { ...opening.role, id: 'other-role' } }).options
        .queryKey,
    ).not.toEqual(first)
    expect(
      createRolePermissionQuery({ ...opening, principalEpoch: 5 }).options.queryKey,
    ).not.toEqual(first)
  })
})
