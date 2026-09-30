import type { AxiosAdapter } from 'axios'
import { afterEach, describe, expect, it } from 'vitest'

import { configureClient, http } from './client'
import { login, logout, refreshToken } from './auth'

const originalAdapter = http.defaults.adapter
afterEach(() => {
  http.defaults.adapter = originalAdapter
})

describe('browser-only authentication adapter', () => {
  it('fetches CSRF before each cookie POST, never sends refresh JSON/Bearer, and drops refresh response fields', async () => {
    const seen: { path: string; anonymous: boolean; hasBody: boolean; hasBearer: boolean }[] = []
    configureClient({
      getAccessToken: () => 'test-memory-access',
      tryRefresh: async () => false,
      onUnauthorized() {},
    })
    const adapter: AxiosAdapter = async (config) => {
      seen.push({
        path: config.url!,
        anonymous: config.anonymous === true,
        hasBody: config.data !== undefined,
        hasBearer: Boolean(config.headers.Authorization),
      })
      return {
        status: 200,
        statusText: 'OK',
        config,
        headers: {},
        data: {
          code: 0,
          data: config.url?.endsWith('/csrf')
            ? { token: 'masked-test-only' }
            : {
                accessToken: 'test-only',
                refreshToken: 'legacy-test-only',
                tokenType: 'Bearer',
                expiresIn: 60,
              },
        },
      }
    }
    http.defaults.adapter = adapter
    expect((await login('fixture', 'FixtureOnly1!')).refreshToken).toBeNull()
    expect((await refreshToken()).refreshToken).toBeNull()
    await logout()
    expect(seen.map((entry) => entry.path)).toEqual([
      '/auth/browser/csrf',
      '/auth/browser/login',
      '/auth/browser/csrf',
      '/auth/browser/refresh',
      '/auth/browser/csrf',
      '/auth/browser/logout',
    ])
    expect(seen.every((entry) => entry.anonymous && !entry.hasBearer)).toBe(true)
    expect(seen.filter((entry) => entry.hasBody).map((entry) => entry.path)).toEqual([
      '/auth/browser/login',
    ])
  })
})
