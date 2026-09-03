import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchCurrentUserRequest, loginRequest, logoutRequest, refreshRequest } = vi.hoisted(() => ({
  fetchCurrentUserRequest: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn<() => Promise<void>>(),
  refreshRequest: vi.fn(),
}))

vi.mock('@/lib/api/auth', () => ({
  fetchCurrentUser: fetchCurrentUserRequest,
  login: loginRequest,
  logout: logoutRequest,
  refreshToken: refreshRequest,
}))

import { queryClient } from '@/app/query-client'

import { useAuthStore } from './auth'

const tokens = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 3600,
  tokenType: 'Bearer',
}

describe('auth logout state machine', () => {
  beforeEach(() => {
    fetchCurrentUserRequest.mockReset()
    loginRequest.mockReset()
    logoutRequest.mockReset()
    refreshRequest.mockReset()
    queryClient.clear()
    useAuthStore.setState({
      tokens,
      user: null,
      roles: [],
      perms: [],
      menus: [],
      meLoaded: false,
      sessionEpoch: 0,
    })
  })

  it('服务端撤销成功后才清理本地令牌', async () => {
    logoutRequest.mockResolvedValue()

    await useAuthStore.getState().logout()

    expect(logoutRequest).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().tokens).toBeNull()
  })

  it('成功注销同时清理旧账户查询缓存', async () => {
    queryClient.setQueryData(['calendar', 'contexts'], [{ id: 'old-account' }])
    logoutRequest.mockResolvedValue()

    await useAuthStore.getState().logout()

    expect(queryClient.getQueryData(['calendar', 'contexts'])).toBeUndefined()
  })

  it('服务端撤销失败时保留本地令牌供用户重试', async () => {
    logoutRequest.mockRejectedValue(new Error('注销失败'))

    await expect(useAuthStore.getState().logout()).rejects.toThrow('注销失败')

    expect(useAuthStore.getState().tokens).toEqual(tokens)
  })

  it('服务端撤销失败时也保留原账户查询缓存', async () => {
    queryClient.setQueryData(['calendar', 'contexts'], [{ id: 'current-account' }])
    logoutRequest.mockRejectedValue(new Error('注销失败'))

    await expect(useAuthStore.getState().logout()).rejects.toThrow('注销失败')

    expect(queryClient.getQueryData(['calendar', 'contexts'])).toEqual([{ id: 'current-account' }])
  })

  it('直接登录切换账户时不复用旧账户缓存', async () => {
    const switchedTokens = { ...tokens, accessToken: 'second-account' }
    queryClient.setQueryData(['calendar', 'contexts'], [{ id: 'first-account' }])
    loginRequest.mockResolvedValue(switchedTokens)
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '2', username: 'second', nickname: '第二账户' },
      roles: [],
      perms: [],
      menus: [],
    })

    await useAuthStore.getState().login('second', 'password')

    expect(queryClient.getQueryData(['calendar', 'contexts'])).toBeUndefined()
    expect(useAuthStore.getState().tokens).toEqual(switchedTokens)
    expect(useAuthStore.getState().user?.id).toBe('2')
  })

  it('账户切换后忽略旧账户晚返回的 ensureMe', async () => {
    let resolveFirstUser!: (value: {
      user: { id: string; username: string; nickname: string }
      roles: string[]
      perms: string[]
      menus: never[]
    }) => void
    const firstUser = new Promise<Parameters<typeof resolveFirstUser>[0]>((resolve) => {
      resolveFirstUser = resolve
    })
    const switchedTokens = { ...tokens, accessToken: 'second-account' }
    fetchCurrentUserRequest.mockReturnValueOnce(firstUser).mockResolvedValueOnce({
      user: { id: '2', username: 'second', nickname: '第二账户' },
      roles: ['ROLE_SECOND'],
      perms: ['calendar:day:list'],
      menus: [],
    })
    loginRequest.mockResolvedValue(switchedTokens)

    const staleEnsureMe = useAuthStore.getState().ensureMe()
    await useAuthStore.getState().login('second', 'password')
    resolveFirstUser({
      user: { id: '1', username: 'first', nickname: '第一账户' },
      roles: ['ROLE_FIRST'],
      perms: ['system:user:list'],
      menus: [],
    })
    await staleEnsureMe

    expect(useAuthStore.getState()).toMatchObject({
      tokens: switchedTokens,
      user: { id: '2', username: 'second', nickname: '第二账户' },
      roles: ['ROLE_SECOND'],
      perms: ['calendar:day:list'],
      meLoaded: true,
    })
  })

  it('401 兜底清理会话时不保留业务缓存', () => {
    queryClient.setQueryData(['system', 'users'], [{ id: 'old-account' }])

    useAuthStore.getState().clearSession()

    expect(queryClient.getQueryData(['system', 'users'])).toBeUndefined()
    expect(useAuthStore.getState().tokens).toBeNull()
  })

  it('refresh 成功后先清空旧身份能力并强制重新读取 me', async () => {
    const refreshed = { ...tokens, accessToken: 'refreshed-access' }
    useAuthStore.setState({
      user: { id: '1', username: 'admin', nickname: '管理员' },
      roles: ['ROLE_ADMIN'],
      perms: ['calendar:day:list'],
      menus: [],
      meLoaded: true,
    })
    refreshRequest.mockResolvedValue(refreshed)

    await expect(useAuthStore.getState().tryRefresh()).resolves.toBe(true)

    expect(refreshRequest).toHaveBeenCalledWith('refresh')
    expect(useAuthStore.getState()).toMatchObject({
      tokens: refreshed,
      user: null,
      roles: [],
      perms: [],
      menus: [],
      meLoaded: false,
    })
  })

  it('ensureMe 保留后端 moduleKey 作为 capability 唯一事实源', async () => {
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '1', username: 'admin', nickname: '管理员' },
      roles: ['ROLE_ADMIN'],
      perms: ['calendar:day:list'],
      menus: [
        {
          id: '200',
          parentId: '0',
          menuName: '万年历',
          type: 'C',
          path: '/calendar',
          component: null,
          perms: null,
          icon: 'calendar-days',
          moduleKey: 'calendar',
          sort: 1,
          children: [],
        },
      ],
    })

    await useAuthStore.getState().ensureMe()

    expect(useAuthStore.getState().menus[0]?.moduleKey).toBe('calendar')
    expect(useAuthStore.getState().meLoaded).toBe(true)
  })
})
