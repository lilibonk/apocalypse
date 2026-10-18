import { QueryClient } from '@tanstack/react-query'
import { CanceledError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGrantCandidatesQuery, createRoleGrantQuery } from './role-grant.queries'
const { auth, request, listeners } = vi.hoisted(() => ({
  auth: {
    sessionEpoch: 4,
    authorizationEpoch: 7,
    meLoaded: true,
    perms: ['system:role:list', 'system:permission:list'],
    allScopePerms: [] as string[],
  },
  request: vi.fn(),
  listeners: new Set<(state: unknown) => void>(),
}))
vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    auth.meLoaded && (epoch === undefined || epoch === auth.authorizationEpoch),
  useAuthStore: {
    getState: () => auth,
    subscribe: (listener: (state: unknown) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  },
}))
vi.mock('@/lib/api/client', () => ({
  request,
  captureRequestContext: () => {
    const epoch = auth.authorizationEpoch
    return {
      principalEpoch: auth.sessionEpoch,
      scoped: false,
      assertCurrent: () => {
        if (epoch !== auth.authorizationEpoch) throw new CanceledError()
      },
    }
  },
}))
const opening = { role: { id: '9223372036854775801' }, principalEpoch: 4, openId: 'opening' }
beforeEach(() => {
  auth.sessionEpoch = 4
  auth.authorizationEpoch = 7
  auth.meLoaded = true
  auth.perms = ['system:role:list', 'system:permission:list']
  request.mockReset()
  listeners.clear()
})
describe('private business grant sources', () => {
  it('keeps the complete grant response and both exact revisions, even without catalog read access', async () => {
    auth.perms = ['system:role:list']
    const baseline = {
      roleId: opening.role.id,
      revision: '9223372036854775806',
      catalogRevision: '9',
      grants: Array.from({ length: 405 }, (_, index) => ({
        permissionId: String(index),
        enabled: true,
        scopeOverride: 'INHERIT_ROLE',
        validFrom: null,
        validUntil: null,
        definition: null,
      })),
    }
    request.mockResolvedValue(baseline)
    const client = new QueryClient()
    const source = createRoleGrantQuery(opening)
    expect(await client.fetchQuery(source.options)).toEqual(baseline)
    expect(request.mock.calls[0]![0]).toBe(`/system/roles/${opening.role.id}/permissions`)
    expect(request.mock.calls[0]![1].query).toBeUndefined()
    client.clear()
  })
  it('uses candidate search filters only for the directory page and in its cache identity', async () => {
    request.mockResolvedValue({ list: [], total: 0, page: 3, size: 4 })
    const client = new QueryClient()
    const params = { page: 3, keyword: 'audit', moduleKey: 'calendar', resource: 'day' }
    const source = createGrantCandidatesQuery(opening, params)
    await client.fetchQuery(source.options)
    expect(request.mock.calls[0]![0]).toBe('/system/permissions/page')
    expect(request.mock.calls[0]![1].query).toEqual({ ...params, size: 4 })
    expect(source.options.queryKey).not.toEqual(
      createGrantCandidatesQuery(opening, { ...params, page: 4 }).options.queryKey,
    )
    expect(source.options.queryKey).not.toEqual(createRoleGrantQuery(opening).options.queryKey)
    client.clear()
  })
  it('does not dispatch a candidate request without directory read permission', async () => {
    auth.perms = ['system:role:list']
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await expect(
      client.fetchQuery(createGrantCandidatesQuery(opening, { page: 1, keyword: '' }).options),
    ).rejects.toBeInstanceOf(CanceledError)
    expect(request).not.toHaveBeenCalled()
    client.clear()
  })
  it('cancels a late complete baseline when the authorization epoch changes', async () => {
    let resolve!: (value: unknown) => void
    request.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const source = createRoleGrantQuery(opening)
    const pending = client.fetchQuery(source.options)
    const rejected = expect(pending).rejects.toBeInstanceOf(CanceledError)
    auth.authorizationEpoch++
    listeners.forEach((listener) => listener(auth))
    resolve({ grants: [] })
    await rejected
    expect(client.getQueryData(source.options.queryKey)).toBeUndefined()
    expect(source.options.queryKey).not.toEqual(createRoleGrantQuery(opening).options.queryKey)
    client.clear()
  })
  it('does not revive directory metadata after a rapid revoke/regrant', async () => {
    let resolve!: (value: unknown) => void
    request.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const source = createGrantCandidatesQuery(opening, { page: 1, keyword: '' })
    const pending = client.fetchQuery(source.options)
    const rejected = expect(pending).rejects.toBeInstanceOf(CanceledError)
    auth.perms = ['system:role:list']
    listeners.forEach((listener) => listener(auth))
    auth.perms.push('system:permission:list')
    listeners.forEach((listener) => listener(auth))
    resolve({ list: [], total: 0, page: 1, size: 4 })
    await rejected
    expect(client.getQueryData(source.options.queryKey)).toBeUndefined()
    expect(request.mock.calls[0]![1].signal.aborted).toBe(true)
    client.clear()
  })
})
