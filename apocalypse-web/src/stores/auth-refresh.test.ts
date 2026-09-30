import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/app/query-client'
import { http, request } from '@/lib/api/client'
import type { CurrentUser, TokenPair } from '@/lib/api/types'
import { accessLifecycle } from '@/lib/query/access-lease'

import { useAuthStore } from './auth'

const originalAdapter = http.defaults.adapter
const initialTokens: TokenPair = {
  accessToken: 'test-only-old-access',
  refreshToken: null,
  tokenType: 'Bearer',
  expiresIn: 3600,
}
const rotatedTokens: TokenPair = {
  ...initialTokens,
  accessToken: 'test-only-new-access',
  refreshToken: null,
}
const switchedTokens: TokenPair = {
  ...initialTokens,
  accessToken: 'test-only-second-account-access',
  refreshToken: null,
}
const latestUser: CurrentUser = {
  user: { id: '1', username: 'test-user', nickname: 'Test user' },
  roles: [],
  perms: [],
  menus: [],
}

function response(config: InternalAxiosRequestConfig, data: unknown, code = 0) {
  return { status: 200, statusText: 'OK', headers: {}, config, data: { code, data } }
}

interface PendingMe {
  finish: (me: CurrentUser) => void
  fail: (code: number) => void
}

let meRequests: PendingMe[]
let refreshCount: number
let redirect: ReturnType<typeof vi.fn>
let waiterCleanups: ReturnType<typeof vi.fn>[]

beforeEach(async () => {
  meRequests = []
  refreshCount = 0
  waiterCleanups = []
  redirect = vi.fn()
  vi.stubGlobal('window', { location: { pathname: '/system/role', assign: redirect } })
  vi.stubGlobal('navigator', {
    locks: { request: (_name: string, task: () => Promise<unknown>) => task() },
  })
  useAuthStore.getState().clearSession()
  await accessLifecycle.reset(1, queryClient)
  useAuthStore.setState({
    tokens: initialTokens,
    user: latestUser.user,
    roles: [],
    perms: ['withdrawn:permission'],
    menus: [],
    meLoaded: true,
    bootstrapped: true,
    sessionEpoch: 1,
  })
  const subscribe = useAuthStore.subscribe
  vi.spyOn(useAuthStore, 'subscribe').mockImplementation((listener) => {
    const cleanup = vi.fn(subscribe(listener))
    waiterCleanups.push(cleanup)
    return cleanup
  })
  const adapter: AxiosAdapter = async (config) => {
    if (config.url === '/auth/browser/csrf') return response(config, { token: 'test-only-csrf' })
    if (config.url === '/auth/browser/refresh') {
      refreshCount++
      return response(config, rotatedTokens)
    }
    if (config.url === '/auth/browser/login') return response(config, switchedTokens)
    if (config.headers.Authorization === `Bearer ${initialTokens.accessToken}`) {
      return response(config, null, 40100)
    }
    if (config.url === '/system/users/me') {
      return new Promise((resolve) => {
        meRequests.push({
          finish: (me) => resolve(response(config, me)),
          fail: (code) => resolve(response(config, null, code)),
        })
      })
    }
    return response(config, { saved: true })
  }
  http.defaults.adapter = adapter
})

afterEach(() => {
  http.defaults.adapter = originalAdapter
  useAuthStore.getState().clearSession()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function beginSupersededRefresh() {
  const refresh = useAuthStore.getState().tryRefresh()
  await vi.waitFor(() => expect(meRequests).toHaveLength(1))
  const newerMe = useAuthStore.getState().ensureMe()
  await vi.waitFor(() => expect(meRequests).toHaveLength(2))
  return { refresh, newerMe }
}

async function finishOlderMe() {
  meRequests[0].finish({ ...latestUser, perms: ['withdrawn:permission'] })
  await vi.waitFor(() => expect(waiterCleanups).toHaveLength(1))
}

function expectWaiterReleased() {
  expect(waiterCleanups).toHaveLength(1)
  expect(waiterCleanups[0]).toHaveBeenCalledOnce()
}

describe('store and client refresh bootstrap', () => {
  it('waits for a newer guard-triggered /me instead of treating the superseded /me as refresh failure', async () => {
    const pendingRequest = request('/core-probe').then(
      (value) => ({ ok: true, value }),
      (error: unknown) => ({ ok: false, error }),
    )
    await vi.waitFor(() => expect(meRequests).toHaveLength(1))

    // RequireAuth runs this effect when rotation replaces tokens while meLoaded is false.
    // The second request deliberately outlives the refresh-owned bootstrap request.
    const guardBootstrap = useAuthStore.getState().ensureMe()
    await vi.waitFor(() => expect(meRequests).toHaveLength(2))
    meRequests[0].finish({ ...latestUser, perms: ['withdrawn:permission'] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const tokensWhileLatestPending = useAuthStore.getState().tokens
    const redirectsWhileLatestPending = redirect.mock.calls.length

    meRequests[1].finish(latestUser)
    await guardBootstrap
    const result = await pendingRequest

    expect(tokensWhileLatestPending).toEqual(rotatedTokens)
    expect(redirectsWhileLatestPending).toBe(0)
    expect(result).toEqual({ ok: true, value: { saved: true } })
    expect(refreshCount).toBe(1)
    expect(useAuthStore.getState()).toMatchObject({
      tokens: rotatedTokens,
      meLoaded: true,
      perms: [],
      sessionEpoch: 1,
    })
    expectWaiterReleased()
  })

  it('keeps the newer snapshot when it arrives before the superseded bootstrap', async () => {
    const { refresh, newerMe } = await beginSupersededRefresh()
    meRequests[1].finish(latestUser)
    await newerMe
    meRequests[0].finish({ ...latestUser, perms: ['withdrawn:permission'] })

    await expect(refresh).resolves.toBe(true)
    expect(useAuthStore.getState().perms).toEqual([])
    expect(useAuthStore.getState().meLoaded).toBe(true)
    expect(waiterCleanups).toHaveLength(0)
    expect(refreshCount).toBe(1)
  })

  it.each([40100, 40300, 500])(
    'fails closed and releases the waiter when the latest /me fails with %i',
    async (code) => {
      const { refresh, newerMe } = await beginSupersededRefresh()
      const newerResult = newerMe.catch((error: unknown) => error)
      await finishOlderMe()
      meRequests[1].fail(code)

      await expect(refresh).resolves.toBe(false)
      await expect(newerResult).resolves.toMatchObject({ code })
      expect(useAuthStore.getState().tokens).toBeNull()
      expectWaiterReleased()
      expect(refreshCount).toBe(1)
    },
  )

  it('stops waiting on clearSession and ignores the late user response', async () => {
    const { refresh, newerMe } = await beginSupersededRefresh()
    await finishOlderMe()
    useAuthStore.getState().clearSession()

    await expect(refresh).resolves.toBe(false)
    expectWaiterReleased()
    meRequests[1].finish(latestUser)
    await newerMe
    expect(useAuthStore.getState().tokens).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('releases the old waiter without overwriting an account switch', async () => {
    const { refresh, newerMe } = await beginSupersededRefresh()
    await finishOlderMe()
    const login = useAuthStore.getState().login('second-test-user', 'test-only-password')
    await vi.waitFor(() => expect(meRequests).toHaveLength(3))
    await expect(refresh).resolves.toBe(false)
    expectWaiterReleased()

    meRequests[2].finish({
      ...latestUser,
      user: { id: '2', username: 'second-test-user', nickname: 'Second test user' },
    })
    await login
    meRequests[1].finish(latestUser)
    await newerMe
    expect(useAuthStore.getState()).toMatchObject({
      tokens: switchedTokens,
      user: { id: '2' },
      meLoaded: true,
      sessionEpoch: 2,
    })
  })

  it('settles and releases the waiter if its token is replaced within the same epoch', async () => {
    const { refresh, newerMe } = await beginSupersededRefresh()
    await finishOlderMe()
    useAuthStore.setState({ tokens: switchedTokens })

    await expect(refresh).resolves.toBe(false)
    expectWaiterReleased()
    meRequests[1].finish(latestUser)
    await newerMe
    expect(useAuthStore.getState().tokens).toEqual(switchedTokens)
    expect(useAuthStore.getState().meLoaded).toBe(false)
  })

  it('keeps concurrent refresh callers in one rotation until the latest /me settles', async () => {
    const { refresh, newerMe } = await beginSupersededRefresh()
    const joinedRefresh = useAuthStore.getState().tryRefresh()
    await finishOlderMe()
    meRequests[1].finish(latestUser)
    await newerMe

    await expect(Promise.all([refresh, joinedRefresh])).resolves.toEqual([true, true])
    expect(refreshCount).toBe(1)
    expectWaiterReleased()
  })
})
