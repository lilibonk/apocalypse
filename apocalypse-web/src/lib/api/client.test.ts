import { AxiosError, isCancel, type AxiosAdapter } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, configureClient, http, request, rawRequest } from './client'

const originalAdapter = http.defaults.adapter
afterEach(() => {
  http.defaults.adapter = originalAdapter
})

describe('API refresh replay', () => {
  it.each([40300, 40400, 40100])(
    'download JSON error %s never becomes a saved Blob',
    async (code) => {
      const tryRefresh = vi.fn(async () => true)
      configureClient({
        getAccessToken: () => 'A',
        getPrincipalEpoch: () => 1,
        tryRefresh,
        onUnauthorized: vi.fn(),
      })
      http.defaults.adapter = async (config) => ({
        status: 200,
        statusText: 'OK',
        config,
        headers: { 'content-type': 'application/json' },
        data: new Blob([JSON.stringify({ code, message: '资源拒绝' })]),
      })
      const result = await rawRequest('/file', 'blob', {
        context: { principalEpoch: 1, scoped: true, assertCurrent() {} },
      }).catch((error: unknown) => error)
      if (code === 40100) {
        expect(isCancel(result)).toBe(true)
        expect(tryRefresh).toHaveBeenCalledOnce()
      } else {
        expect(result).toBeInstanceOf(ApiError)
        expect(result).toMatchObject({ code, message: '资源拒绝' })
        expect(tryRefresh).not.toHaveBeenCalled()
      }
    },
  )
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

  it('取消信号到达真实 adapter，取消不刷新或转换成网络错误', async () => {
    const controller = new AbortController()
    const tryRefresh = vi.fn(async () => true)
    const onUnauthorized = vi.fn()
    configureClient({ getAccessToken: () => 'A', tryRefresh, onUnauthorized })
    let observed: AbortSignal | undefined
    let finish!: () => void
    http.defaults.adapter = async (config) => {
      observed = config.signal as AbortSignal
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return { status: 200, statusText: 'OK', headers: {}, config, data: new Blob(['secret']) }
    }
    const pending = rawRequest('/file', 'blob', { signal: controller.signal }).catch(
      (error: unknown) => error,
    )
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()
    finish()
    expect(isCancel(await pending)).toBe(true)
    expect(observed?.aborted).toBe(true)
    expect(tryRefresh).not.toHaveBeenCalled()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('旧身份的迟到 401 不刷新、不注销新账户，也不发送新 token', async () => {
    let epoch = 1
    const tryRefresh = vi.fn(async () => true)
    const onUnauthorized = vi.fn()
    configureClient({
      getAccessToken: () => (epoch === 1 ? 'A' : 'B'),
      getPrincipalEpoch: () => epoch,
      tryRefresh,
      onUnauthorized,
    })
    let finish!: () => void
    let authorization: unknown
    http.defaults.adapter = async (config) => {
      authorization = config.headers.Authorization
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return { status: 200, statusText: 'OK', headers: {}, config, data: { code: 40100 } }
    }
    const pending = request('/module').catch((error: unknown) => error)
    await Promise.resolve()
    await Promise.resolve()
    epoch = 2
    finish()
    expect(isCancel(await pending)).toBe(true)
    expect(authorization).toBe('Bearer A')
    expect(tryRefresh).not.toHaveBeenCalled()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('scoped 401 单飞刷新，但不自动重放旧 mutation', async () => {
    const tryRefresh = vi.fn(async () => true)
    const onUnauthorized = vi.fn()
    configureClient({
      getAccessToken: () => 'A',
      getPrincipalEpoch: () => 1,
      tryRefresh,
      onUnauthorized,
    })
    const adapter = vi.fn<AxiosAdapter>(async (config) => ({
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { code: 40100 },
    }))
    http.defaults.adapter = adapter
    const context = { principalEpoch: 1, scoped: true, assertCurrent: () => {} }
    const results = await Promise.all([
      request('/module', { method: 'POST', context }).catch((error: unknown) => error),
      request('/module', { method: 'POST', context }).catch((error: unknown) => error),
    ])
    expect(results.every(isCancel)).toBe(true)
    expect(adapter).toHaveBeenCalledTimes(2)
    expect(tryRefresh).toHaveBeenCalledOnce()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
