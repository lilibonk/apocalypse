import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '@/lib/api/types'

const { fetchMe, refresh } = vi.hoisted(() => ({ fetchMe: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ fetchCurrentUser: fetchMe, refreshToken: refresh }))
vi.mock('@/lib/browser-session', () => ({
  supportsBrowserSessionLock: () => true,
  withBrowserSessionLock: <T>(task: () => Promise<T>) => task(),
  publishBrowserSessionChange: vi.fn(),
  subscribeBrowserSessionChange: vi.fn(() => () => {}),
  subscribeBrowserSessionRestore: vi.fn(() => () => {}),
}))

import { queryClient } from '@/app/query-client'
import { assertPermissionAccess, captureRequestContext } from '@/lib/api/client'
import { accessLifecycle } from '@/lib/query/access-lease'
import { subscribeBrowserSessionRestore } from '@/lib/browser-session'
import { assertAuthorizationCurrent, startBrowserSessionSync, useAuthStore } from './auth'

const tokens = {
  accessToken: 'test-only-access',
  refreshToken: null,
  tokenType: 'Bearer',
  expiresIn: 3600,
}
const current: CurrentUser = {
  user: { id: '1', username: 'tester', nickname: null },
  roles: ['operator'],
  perms: ['system:role:edit'],
  menus: [],
  allScopePerms: ['system:role:edit'],
  authorizationSnapshotId: 'all-scope',
  evaluatedAt: '2026-10-18T12:00:00Z',
  nextTransitionAt: null,
}
let now = 0

beforeEach(() => {
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  now = 0
  fetchMe.mockReset()
  refresh.mockReset()
  useAuthStore.getState().clearSession()
  useAuthStore.setState({ tokens, bootstrapped: true })
})
afterEach(() => {
  useAuthStore.getState().clearSession()
  vi.restoreAllMocks()
})

describe('authorization snapshots across core and graph operation lifetimes', () => {
  it('rebinds a BFCache document to the shared cookie after a missed account broadcast', async () => {
    fetchMe.mockResolvedValueOnce(current)
    await useAuthStore.getState().ensureMe()
    const prior = captureRequestContext()
    queryClient.setQueryData(['private-before-suspension'], 'previous-account')
    const stop = startBrowserSessionSync()
    const restore = vi.mocked(subscribeBrowserSessionRestore).mock.calls.at(-1)?.[0]
    expect(restore).toBeTypeOf('function')
    refresh.mockResolvedValueOnce({ ...tokens, accessToken: 'new-cookie-account-access' })
    fetchMe.mockResolvedValueOnce({
      ...current,
      user: { id: '2', username: 'new-cookie-account', nickname: null },
      perms: [],
      allScopePerms: [],
      authorizationSnapshotId: 'second-account',
    })
    restore?.(true)
    expect(useAuthStore.getState().meLoaded).toBe(false)
    expect(queryClient.getQueryData(['private-before-suspension'])).toBeUndefined()
    expect(() => prior.assertCurrent()).toThrow()
    await vi.waitFor(() => expect(useAuthStore.getState().meLoaded).toBe(true))
    expect(useAuthStore.getState().user?.id).toBe('2')
    expect(useAuthStore.getState().perms).toEqual([])
    expect(refresh).toHaveBeenCalledOnce()
    stop()
  })

  it('module commit expires the shared core generation before a delayed timer fires', async () => {
    fetchMe.mockResolvedValueOnce({
      ...current,
      menus: [
        {
          id: '9',
          parentId: '0',
          menuName: 'Calendar',
          menuType: 'M',
          path: 'calendar',
          component: 'calendar/index',
          perms: null,
          icon: null,
          moduleKey: 'calendar',
          sort: 0,
          children: [],
        },
      ],
      nextTransitionAt: '2026-10-18T12:00:01Z',
    })
    await useAuthStore.getState().ensureMe()
    const operation = accessLifecycle.begin(
      accessLifecycle.capture('calendar', ['system:role:edit']),
    )
    const oldCore = captureRequestContext()
    queryClient.setQueryData(['core-private-data'], 'all-departments')
    fetchMe.mockResolvedValueOnce({ ...current, authorizationSnapshotId: 'after-module-expiry' })
    now = 1001
    expect(operation.isCurrent()).toBe(false)
    expect(operation.signal.aborted).toBe(true)
    expect(useAuthStore.getState().meLoaded).toBe(false)
    expect(queryClient.getQueryData(['core-private-data'])).toBeUndefined()
    await vi.waitFor(() => expect(useAuthStore.getState().meLoaded).toBe(true))
    expect(() => oldCore.assertCurrent()).toThrow()
    operation.finish()
  })

  it('invalidates dispatch and callback commit even when the expiry timer has not fired', async () => {
    fetchMe.mockResolvedValueOnce({
      ...current,
      nextTransitionAt: '2026-10-18T12:00:01Z',
    })
    await useAuthStore.getState().ensureMe()
    const oldOperation = captureRequestContext()
    const previousEpoch = useAuthStore.getState().authorizationEpoch
    queryClient.setQueryData(['core-private-data'], ['all-departments'])
    fetchMe.mockResolvedValueOnce({
      ...current,
      authorizationSnapshotId: 'department-scope',
      allScopePerms: [],
    })
    // Advance only the clock; do not run timer callbacks or React cleanup.
    now = 1001
    expect(() => oldOperation.assertCurrent()).toThrow('expired')
    expect(useAuthStore.getState().meLoaded).toBe(false)
    expect(useAuthStore.getState().authorizationEpoch).toBeGreaterThan(previousEpoch)
    expect(queryClient.getQueryData(['core-private-data'])).toBeUndefined()
    await vi.waitFor(() => expect(useAuthStore.getState().meLoaded).toBe(true))
    expect(useAuthStore.getState().perms).toEqual(current.perms)
    expect(useAuthStore.getState().allScopePerms).toEqual([])
    expect(() => oldOperation.assertCurrent()).toThrow()
    expect(() => assertPermissionAccess(['system:role:edit'], ['system:role:edit'])).toThrow()
    expect(fetchMe).toHaveBeenCalledTimes(2)
  })

  it('same-code range changes reject old local callbacks synchronously without a UI unmount', async () => {
    fetchMe.mockResolvedValueOnce(current)
    await useAuthStore.getState().ensureMe()
    const oldOperation = captureRequestContext()
    const effect = vi.fn()
    let finish!: () => void
    const result = new Promise<void>((resolve) => (finish = resolve)).then(() => {
      oldOperation.assertCurrent()
      effect()
    })
    const failure = result.catch((error: unknown) => error)
    fetchMe.mockResolvedValueOnce({
      ...current,
      authorizationSnapshotId: 'department-scope',
      allScopePerms: [],
    })
    await useAuthStore.getState().ensureMe()
    finish()
    await expect(failure).resolves.toMatchObject({ code: 'ERR_CANCELED' })
    expect(effect).not.toHaveBeenCalled()
  })

  it('coalesces valid focus reads and preserves cache and editor generation for the same snapshot', async () => {
    fetchMe.mockResolvedValueOnce(current)
    await useAuthStore.getState().ensureMe()
    const epoch = useAuthStore.getState().authorizationEpoch
    const activeOperation = captureRequestContext()
    queryClient.setQueryData(['draft-context'], { scope: 'DEPT', window: 'unsaved' })
    let finish!: (value: CurrentUser) => void
    fetchMe.mockImplementationOnce(() => new Promise<CurrentUser>((resolve) => (finish = resolve)))
    const one = useAuthStore.getState().ensureMe()
    const two = useAuthStore.getState().ensureMe()
    expect(fetchMe).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().meLoaded).toBe(true)
    finish({ ...current, evaluatedAt: '2026-10-18T13:00:00Z' })
    await Promise.all([one, two])
    expect(useAuthStore.getState().authorizationEpoch).toBe(epoch)
    expect(() => activeOperation.assertCurrent()).not.toThrow()
    expect(queryClient.getQueryData(['draft-context'])).toEqual({
      scope: 'DEPT',
      window: 'unsaved',
    })
  })

  it('discards a late /me before mounting and retries without logout or refresh rotation', async () => {
    fetchMe.mockImplementationOnce(() => {
      now = 20
      return Promise.resolve({ ...current, nextTransitionAt: '2026-10-18T12:00:00.010Z' })
    })
    fetchMe.mockResolvedValueOnce({ ...current, authorizationSnapshotId: 'after-boundary' })
    await useAuthStore.getState().ensureMe()
    expect(useAuthStore.getState()).toMatchObject({
      tokens,
      meLoaded: true,
      authorizationSnapshotId: 'after-boundary',
    })
    expect(refresh).not.toHaveBeenCalled()
    expect(fetchMe).toHaveBeenCalledTimes(2)
  })

  it('bounds repeated expired snapshots and retains identity in a disabled retry state', async () => {
    fetchMe.mockImplementation(() => {
      now += 2
      return Promise.resolve({ ...current, nextTransitionAt: '2026-10-18T12:00:00.001Z' })
    })
    await useAuthStore.getState().ensureMe()
    expect(fetchMe).toHaveBeenCalledTimes(3)
    expect(useAuthStore.getState().tokens).toEqual(tokens)
    expect(useAuthStore.getState().meLoaded).toBe(false)
    expect(useAuthStore.getState().authorizationError).toBeTruthy()
    expect(() => assertAuthorizationCurrent()).toThrow()
  })

  it('keeps still-valid drafts on a background network error', async () => {
    fetchMe.mockResolvedValueOnce(current)
    await useAuthStore.getState().ensureMe()
    const epoch = useAuthStore.getState().authorizationEpoch
    queryClient.setQueryData(['draft-context'], 'unchanged')
    fetchMe.mockRejectedValueOnce(new Error('network unavailable'))
    await expect(useAuthStore.getState().ensureMe()).rejects.toThrow('network unavailable')
    expect(useAuthStore.getState()).toMatchObject({
      tokens,
      meLoaded: true,
      authorizationEpoch: epoch,
      authorizationError: null,
    })
    expect(queryClient.getQueryData(['draft-context'])).toBe('unchanged')
  })

  it('rejects the old server contract without accepting any business authority', async () => {
    fetchMe.mockResolvedValue({ user: current.user, perms: current.perms, menus: [], roles: [] })
    await expect(useAuthStore.getState().ensureMe()).rejects.toThrow('格式无效')
    expect(useAuthStore.getState().tokens).toEqual(tokens)
    expect(useAuthStore.getState().meLoaded).toBe(false)
    expect(useAuthStore.getState().perms).toEqual([])
  })
})
