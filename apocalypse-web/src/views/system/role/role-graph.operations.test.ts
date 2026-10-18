import { QueryClient } from '@tanstack/react-query'
import { CanceledError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'

import {
  captureRoleGraphOperation,
  createRole,
  deleteRole,
  invalidateRoleGraphQueries,
  isRoleGraphConflict,
  saveRoleMenus,
  updateRole,
} from './role-graph.operations'

const { auth, request, listeners } = vi.hoisted(() => ({
  auth: {
    authorizationEpoch: 1,
    get allScopePerms() {
      return this.perms
    },
    sessionEpoch: 4,
    meLoaded: true,
    perms: ['system:role:list', 'system:role:edit'],
  },
  request: vi.fn(),
  listeners: new Set<() => void>(),
}))
vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    epoch === undefined || epoch === auth.authorizationEpoch,
  assertAuthorizationCurrent: () => undefined,
  useAuthStore: {
    getState: () => auth,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  },
}))
vi.mock('@/lib/api/client', async (original) => ({
  ...(await original<typeof import('@/lib/api/client')>()),
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

function deferred<Data>() {
  let resolve!: (data: Data) => void
  const promise = new Promise<Data>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  auth.sessionEpoch = 4
  auth.meLoaded = true
  auth.perms = ['system:role:list', 'system:role:edit']
  request.mockReset()
  listeners.clear()
})

describe('role graph existing-endpoint operations', () => {
  it('preserves the complete role payload and exact snowflake identity for CRUD', async () => {
    request.mockResolvedValueOnce('9223372036854775801').mockResolvedValue(undefined)
    const operation = captureRoleGraphOperation(['system:role:edit'], () => true)
    const body = {
      roleName: 'Ops',
      roleKey: 'ops',
      sort: 17,
      status: 0,
      remark: 'Keep this note',
      dataScope: 'DEPT',
      expectedAuthorizationRevision: '12',
    }
    expect(await createRole(operation.transport, body)).toBe('9223372036854775801')
    await updateRole(operation.transport, { roleId: '9223372036854775801', body })
    await deleteRole(operation.transport, '9223372036854775801')
    expect(request.mock.calls.map(([path, options]) => [path, options.method])).toEqual([
      ['/system/roles', 'POST'],
      ['/system/roles/9223372036854775801', 'PUT'],
      ['/system/roles/9223372036854775801', 'DELETE'],
    ])
    expect(request.mock.calls[0]![1].body).toEqual(body)
    expect(request.mock.calls[1]![1].body).toEqual(body)
    for (const [, options] of request.mock.calls) {
      expect(options.signal).toBe(operation.transport.signal)
      expect(options.context).toBe(operation.transport.context)
    }
    operation.finish()
  })

  it('submits only navigation deltas and preserves untouched unresolved IDs', async () => {
    request.mockResolvedValue(undefined)
    const operation = captureRoleGraphOperation(['system:role:edit'], () => true)
    const menuIds = ['100', 'unresolved-id', '101']
    await saveRoleMenus(operation.transport, {
      roleId: 'role-A',
      expectedRevision: '12',
      baselineMenuIds: ['100', 'unresolved-id'],
      menuIds,
    })
    expect(request.mock.calls.map(([path, options]) => [path, options.method ?? 'GET'])).toEqual([
      ['/system/roles/role-A/navigation', 'PUT'],
    ])
    expect(request.mock.calls[0]![1].body).toEqual({
      expectedRevision: '12',
      addIds: ['101'],
      removeIds: [],
    })
    operation.finish()
  })

  it('does not submit a partial role update that would reset omitted ordinary fields', async () => {
    const operation = captureRoleGraphOperation(['system:role:edit'], () => true)
    await expect(
      updateRole(operation.transport, {
        roleId: 'role-A',
        body: { roleName: 'Ops', roleKey: 'ops', status: 0 },
      }),
    ).rejects.toMatchObject({ code: -1 })
    expect(request).not.toHaveBeenCalled()
    operation.finish()
  })

  it('does not overwrite a changed baseline or confuse a conflict with authorization denial', async () => {
    request.mockRejectedValue(new ApiError(40900, 'Role revision changed'))
    const operation = captureRoleGraphOperation(['system:role:edit'], () => true)
    const error = await saveRoleMenus(operation.transport, {
      roleId: 'role-A',
      expectedRevision: '12',
      baselineMenuIds: ['100'],
      menuIds: [],
    }).catch((reason: unknown) => reason)
    expect(isRoleGraphConflict(error)).toBe(true)
    expect(isRoleGraphConflict(new ApiError(40300, 'Denied'))).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)
    operation.finish()
  })

  it('freezes the submitted menu set before the versioned request yields', async () => {
    const preflight = deferred<string[]>()
    request.mockReturnValueOnce(preflight.promise).mockResolvedValueOnce(undefined)
    const operation = captureRoleGraphOperation(['system:role:edit'], () => true)
    const menuIds = ['100', '101']
    const pending = saveRoleMenus(operation.transport, {
      roleId: 'role-A',
      expectedRevision: '12',
      baselineMenuIds: ['100'],
      menuIds,
    })
    menuIds.push('late-ui-change')
    preflight.resolve(['100'])
    await pending
    expect(request.mock.calls[0]![1].body).toEqual({
      expectedRevision: '12',
      addIds: ['101'],
      removeIds: [],
    })
    operation.finish()
  })

  it.each(['permission', 'refresh', 'identity', 'editor'] as const)(
    'rejects late success after %s invalidates the versioned request',
    async (change) => {
      const preflight = deferred<string[]>()
      request.mockReturnValue(preflight.promise)
      let localCurrent = true
      const operation = captureRoleGraphOperation(['system:role:edit'], () => localCurrent)
      const pending = saveRoleMenus(operation.transport, {
        roleId: 'role-A',
        expectedRevision: '12',
        baselineMenuIds: ['100'],
        menuIds: [],
      })
      const rejected = expect(pending).rejects.toBeInstanceOf(CanceledError)
      if (change === 'permission') auth.perms = ['system:role:list']
      else if (change === 'refresh') auth.meLoaded = false
      else if (change === 'identity') auth.sessionEpoch++
      else localCurrent = false
      listeners.forEach((listener) => listener())
      auth.meLoaded = true
      auth.perms = ['system:role:list', 'system:role:edit']
      preflight.resolve(['100'])
      await rejected
      expect(request).toHaveBeenCalledTimes(1)
      expect(operation.transport.signal.aborted).toBe(true)
      expect(listeners.size).toBe(0)
    },
  )

  it('requires an accepted permission at dispatch and releases its authorization subscription', () => {
    auth.meLoaded = false
    expect(() => captureRoleGraphOperation(['system:role:edit'], () => true)).toThrow(CanceledError)
    auth.meLoaded = true
    auth.perms = []
    expect(() => captureRoleGraphOperation(['system:role:edit'], () => true)).toThrow(CanceledError)
    auth.perms = ['system:role:edit']
    const operation = captureRoleGraphOperation(['system:role:edit'], () => true)
    expect(listeners.size).toBe(1)
    operation.finish()
    expect(listeners.size).toBe(0)
    expect(operation.isCurrent()).toBe(false)
  })

  it('invalidates both role page languages and target associations without touching other domains', async () => {
    const cache = new QueryClient()
    const dyna = ['dyna', '/system/roles', 'system-role', 1]
    const choices = ['system', 'roles', 'permission-graph-choices', 4, 'workspace']
    const target = ['system', 'roles', 'role-A', 'menus', 'permission-graph']
    const other = ['system', 'roles', 'role-B', 'menus']
    const users = ['dyna', '/system/users', 'system-user', 1]
    for (const key of [dyna, choices, target, other, users])
      cache.setQueryData(key, { loaded: true })
    await invalidateRoleGraphQueries(cache, 'role-A')
    for (const key of [dyna, choices, target])
      expect(cache.getQueryState(key)?.isInvalidated).toBe(true)
    for (const key of [other, users]) expect(cache.getQueryState(key)?.isInvalidated).toBe(false)
    cache.clear()
  })
})
