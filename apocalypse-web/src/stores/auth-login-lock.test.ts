import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  login: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
  tail: Promise.resolve(),
  acquisitions: 0,
  active: 0,
  maxActive: 0,
}))
vi.mock('@/lib/api/auth', () => ({
  login: fixture.login,
  refreshToken: fixture.refresh,
  fetchCurrentUser: fixture.me,
}))
vi.mock('@/lib/browser-session', () => ({
  supportsBrowserSessionLock: () => true,
  withBrowserSessionLock: async <T>(task: () => Promise<T>) => {
    const previous = fixture.tail
    let release!: () => void
    fixture.tail = new Promise<void>((resolve) => (release = resolve))
    await previous
    fixture.acquisitions++
    fixture.active++
    fixture.maxActive = Math.max(fixture.maxActive, fixture.active)
    try {
      return await task()
    } finally {
      fixture.active--
      release()
    }
  },
  publishBrowserSessionChange: vi.fn(),
  subscribeBrowserSessionChange: vi.fn(() => () => {}),
  subscribeBrowserSessionRestore: vi.fn(() => () => {}),
}))

import { ApiError } from '@/lib/api/client'
import { useAuthStore } from './auth'

beforeEach(() => {
  useAuthStore.getState().clearSession()
  fixture.login.mockReset()
  fixture.refresh.mockReset()
  fixture.me.mockReset()
  fixture.tail = Promise.resolve()
  fixture.acquisitions = fixture.active = fixture.maxActive = 0
})
afterEach(() => useAuthStore.getState().clearSession())

it('releases the login cookie lock before a rejected first /me needs a refresh', async () => {
  const first = {
    accessToken: 'first-login-token',
    refreshToken: null,
    tokenType: 'Bearer',
    expiresIn: 3600,
  }
  const refreshed = { ...first, accessToken: 'after-concurrent-authorization-change' }
  fixture.login.mockResolvedValue(first)
  fixture.refresh.mockResolvedValue(refreshed)
  fixture.me.mockRejectedValueOnce(new ApiError(40100, '授权版本变化')).mockResolvedValueOnce({
    user: { id: '1', username: 'operator', nickname: null },
    roles: [],
    perms: [],
    menus: [],
    allScopePerms: [],
    authorizationSnapshotId: 'current',
    evaluatedAt: '2026-10-18T00:00:00Z',
    nextTransitionAt: null,
  })

  await expect(useAuthStore.getState().login('operator', 'test-only-password')).resolves.toBe(true)
  expect(fixture.acquisitions).toBe(2)
  expect(fixture.maxActive).toBe(1)
  expect(useAuthStore.getState()).toMatchObject({
    tokens: refreshed,
    meLoaded: true,
    bootstrapped: true,
  })
})
