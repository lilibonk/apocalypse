import { CanceledError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'
import { isResourceDenied } from '@/lib/query/use-resource-denial'

import { captureRoleGraphOperation, isRoleGraphConflict } from './role-graph.operations'
import { saveRoleMembers } from './role-member.operations'

const { auth, request, listeners } = vi.hoisted(() => ({
  auth: {
    authorizationEpoch: 1,
    get allScopePerms() {
      return this.perms
    },
    sessionEpoch: 4,
    meLoaded: true,
    perms: [] as string[],
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

const perms = ['system:role:list', 'system:role:edit', 'system:user:list']
const roleId = '9223372036854775801'
const visibleId = '9223372036854775802'
const hiddenId = '9223372036854775803'
const newId = '9223372036854775804'
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
  auth.perms = [...perms]
  request.mockReset()
  listeners.clear()
})

describe('role member replacement operation', () => {
  it('reads the complete baseline and retains out-of-scope IDs in the exact replacement payload', async () => {
    request.mockResolvedValueOnce([hiddenId, visibleId, hiddenId]).mockResolvedValueOnce(undefined)
    const operation = captureRoleGraphOperation(perms, () => true)
    await saveRoleMembers(operation.transport, {
      roleId,
      baselineUserIds: [visibleId, hiddenId],
      userIds: [visibleId, hiddenId, newId, newId],
    })
    expect(request.mock.calls.map(([path, options]) => [path, options.method ?? 'GET'])).toEqual([
      [`/system/roles/${roleId}/user-ids`, 'GET'],
      [`/system/roles/${roleId}/users`, 'PUT'],
    ])
    expect(request.mock.calls[1]![1].body).toEqual([visibleId, hiddenId, newId])
    for (const [, options] of request.mock.calls) {
      expect(options.signal).toBe(operation.transport.signal)
      expect(options.context).toBe(operation.transport.context)
    }
    operation.finish()
    expect(listeners.size).toBe(0)
  })

  it.each([[visibleId], [visibleId, hiddenId, newId], [visibleId, newId]])(
    'blocks a changed complete baseline %j before sending PUT',
    async (...latest) => {
      request.mockResolvedValue(latest)
      const operation = captureRoleGraphOperation(perms, () => true)
      const error = await saveRoleMembers(operation.transport, {
        roleId,
        baselineUserIds: [visibleId, hiddenId],
        userIds: [visibleId],
      }).catch((reason: unknown) => reason)
      expect(isRoleGraphConflict(error)).toBe(true)
      expect(isResourceDenied(error)).toBe(false)
      expect(request).toHaveBeenCalledTimes(1)
      operation.finish()
    },
  )

  it('snapshots both ID collections before the asynchronous preflight', async () => {
    const preflight = deferred<string[]>()
    request.mockReturnValueOnce(preflight.promise).mockResolvedValueOnce(undefined)
    const operation = captureRoleGraphOperation(perms, () => true)
    const baselineUserIds = [visibleId, hiddenId]
    const userIds = [hiddenId, newId]
    const pending = saveRoleMembers(operation.transport, { roleId, baselineUserIds, userIds })
    baselineUserIds.length = 0
    userIds.push('late-ui-change')
    preflight.resolve([visibleId, hiddenId])
    await pending
    expect(request.mock.calls[1]![1].body).toEqual([hiddenId, newId])
    operation.finish()
  })

  it.each([403, 404])(
    'propagates baseline denial %s without attempting a replacement',
    async (code) => {
      const denial = new ApiError(code, '角色成员已不可访问')
      request.mockRejectedValue(denial)
      const operation = captureRoleGraphOperation(perms, () => true)
      await expect(
        saveRoleMembers(operation.transport, {
          roleId,
          baselineUserIds: [hiddenId],
          userIds: [],
        }),
      ).rejects.toBe(denial)
      expect(request).toHaveBeenCalledTimes(1)
      operation.finish()
    },
  )

  it.each(['edit-permission', 'profile-permission', 'refresh', 'identity', 'editor'] as const)(
    'cancels the complete-baseline preflight after %s changes, even if grants return immediately',
    async (change) => {
      const preflight = deferred<string[]>()
      request.mockReturnValueOnce(preflight.promise)
      let localCurrent = true
      const operation = captureRoleGraphOperation(perms, () => localCurrent)
      const pending = saveRoleMembers(operation.transport, {
        roleId,
        baselineUserIds: [visibleId, hiddenId],
        userIds: [hiddenId],
      })
      const rejected = expect(pending).rejects.toBeInstanceOf(CanceledError)
      if (change === 'edit-permission') auth.perms = ['system:role:list', 'system:user:list']
      else if (change === 'profile-permission')
        auth.perms = ['system:role:list', 'system:role:edit']
      else if (change === 'refresh') auth.meLoaded = false
      else if (change === 'identity') auth.sessionEpoch++
      else localCurrent = false
      listeners.forEach((listener) => listener())
      auth.meLoaded = true
      auth.perms = [...perms]
      preflight.resolve([visibleId, hiddenId])
      await rejected
      expect(request).toHaveBeenCalledTimes(1)
      expect(operation.transport.signal.aborted).toBe(true)
      expect(listeners.size).toBe(0)
    },
  )

  it('does not report a successful save after its principal is replaced during PUT', async () => {
    const write = deferred<void>()
    request.mockResolvedValueOnce([visibleId, hiddenId]).mockReturnValueOnce(write.promise)
    const operation = captureRoleGraphOperation(perms, () => true)
    const pending = saveRoleMembers(operation.transport, {
      roleId,
      baselineUserIds: [visibleId, hiddenId],
      userIds: [hiddenId],
    })
    const rejected = expect(pending).rejects.toBeInstanceOf(CanceledError)
    await Promise.resolve()
    expect(request.mock.calls[1]![1].method).toBe('PUT')
    auth.sessionEpoch++
    listeners.forEach((listener) => listener())
    write.resolve()
    await rejected
    expect(listeners.size).toBe(0)
  })
})
