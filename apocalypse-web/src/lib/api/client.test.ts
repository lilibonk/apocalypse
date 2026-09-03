import { AxiosError, type AxiosAdapter } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { configureClient, http, request } from './client'

const originalAdapter = http.defaults.adapter
afterEach(() => {
  http.defaults.adapter = originalAdapter
})

describe('API refresh replay', () => {
  it.each(['envelope', 'http'] as const)(
    'preserves a successful null response after %s 401',
    async (kind) => {
      const tryRefresh = vi.fn(async () => true)
      const onUnauthorized = vi.fn()
      configureClient({ getAccessToken: () => 'test-only', tryRefresh, onUnauthorized })
      const adapter: AxiosAdapter = async (config) => {
        if (!config._retried && kind === 'http') {
          throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: null,
          })
        }
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { code: config._retried ? 0 : 40100, message: 'test', data: null },
        }
      }
      http.defaults.adapter = adapter

      await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeNull()
      expect(tryRefresh).toHaveBeenCalledOnce()
      expect(onUnauthorized).not.toHaveBeenCalled()
    },
  )
})
