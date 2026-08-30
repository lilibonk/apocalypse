import { beforeEach, describe, expect, it, vi } from 'vitest'

const { logoutRequest } = vi.hoisted(() => ({
  logoutRequest: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/api/auth', () => ({
  fetchCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: logoutRequest,
  refreshToken: vi.fn(),
}))

import { useAuthStore } from './auth'

const tokens = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 3600,
  tokenType: 'Bearer',
}

describe('auth logout state machine', () => {
  beforeEach(() => {
    logoutRequest.mockReset()
    useAuthStore.setState({
      tokens,
      user: null,
      roles: [],
      perms: [],
      menus: [],
      meLoaded: false,
    })
  })

  it('服务端撤销成功后才清理本地令牌', async () => {
    logoutRequest.mockResolvedValue()

    await useAuthStore.getState().logout()

    expect(logoutRequest).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().tokens).toBeNull()
  })

  it('服务端撤销失败时保留本地令牌供用户重试', async () => {
    logoutRequest.mockRejectedValue(new Error('注销失败'))

    await expect(useAuthStore.getState().logout()).rejects.toThrow('注销失败')

    expect(useAuthStore.getState().tokens).toEqual(tokens)
  })
})
