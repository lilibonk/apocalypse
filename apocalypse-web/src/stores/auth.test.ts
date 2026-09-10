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
import { accessLifecycle } from '@/lib/query/access-lease'

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
    accessLifecycle.reset(0, queryClient)
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

  it('refresh 成功后必须完成 me 才恢复授权，身份代次不因令牌旋转而改变', async () => {
    const refreshed = { ...tokens, accessToken: 'refreshed-access' }
    useAuthStore.setState({
      user: { id: '1', username: 'admin', nickname: '管理员' },
      roles: ['ROLE_ADMIN'],
      perms: ['calendar:day:list'],
      menus: [],
      meLoaded: true,
    })
    refreshRequest.mockResolvedValue(refreshed)
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '1', username: 'admin', nickname: '管理员' },
      roles: [],
      perms: [],
      menus: [],
    })

    await expect(useAuthStore.getState().tryRefresh()).resolves.toBe(true)

    expect(refreshRequest).toHaveBeenCalledWith('refresh')
    expect(useAuthStore.getState()).toMatchObject({
      tokens: refreshed,
      user: { id: '1' },
      roles: [],
      perms: [],
      menus: [],
      meLoaded: true,
      sessionEpoch: 0,
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

  it.each(['success', 'failure'])('同账户旧 me %s 不覆盖较新撤权快照', async (outcome) => {
    let resolve!: (value: unknown) => void
    let reject!: (error: Error) => void
    const stale = new Promise((yes, no) => {
      resolve = yes
      reject = no
    })
    const me = { user: { id: '1', username: 'admin' }, roles: [], perms: [], menus: [] }
    fetchCurrentUserRequest.mockReturnValueOnce(stale).mockResolvedValueOnce(me)
    const first = useAuthStore.getState().ensureMe()
    await useAuthStore.getState().ensureMe()
    if (outcome === 'success') resolve({ ...me, perms: ['withdrawn'] })
    else reject(new Error('old failure'))
    await first
    expect(useAuthStore.getState().tokens).toEqual(tokens)
    expect(useAuthStore.getState().perms).toEqual([])
    expect(useAuthStore.getState().meLoaded).toBe(true)
  })

  it('旧登录与迟到登出不能覆盖后发登录', async () => {
    let finishOldLogin!: (value: typeof tokens) => void
    let finishLogout!: () => void
    loginRequest
      .mockReturnValueOnce(
        new Promise((done) => {
          finishOldLogin = done
        }),
      )
      .mockResolvedValueOnce({ ...tokens, accessToken: 'new-account' })
    logoutRequest.mockReturnValueOnce(
      new Promise<void>((done) => {
        finishLogout = done
      }),
    )
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '2' },
      roles: [],
      perms: [],
      menus: [],
    })
    const oldLogin = useAuthStore.getState().login('old', 'secret')
    const oldLogout = useAuthStore.getState().logout()
    await useAuthStore.getState().login('new', 'secret')
    finishOldLogin(tokens)
    finishLogout()
    await Promise.all([oldLogin, oldLogout])
    expect(useAuthStore.getState().tokens?.accessToken).toBe('new-account')
    expect(useAuthStore.getState().user?.id).toBe('2')
  })

  it('并发刷新只消费一次 refreshToken，并等待 me 完成', async () => {
    let finishRefresh!: (value: typeof tokens) => void
    refreshRequest.mockReturnValueOnce(
      new Promise((done) => {
        finishRefresh = done
      }),
    )
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '1' },
      roles: [],
      perms: [],
      menus: [],
    })
    const first = useAuthStore.getState().tryRefresh()
    const second = useAuthStore.getState().tryRefresh()
    expect(refreshRequest).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().meLoaded).toBe(false)
    finishRefresh({ ...tokens, accessToken: 'refreshed' })
    expect(await Promise.all([first, second])).toEqual([true, true])
    expect(fetchCurrentUserRequest).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().meLoaded).toBe(true)
  })
})
