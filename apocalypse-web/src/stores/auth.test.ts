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

// Local store races are isolated here; browser-session.test.ts and Playwright verify Web Locks.
vi.mock('@/lib/browser-session', () => ({
  supportsBrowserSessionLock: vi.fn(() => true),
  withBrowserSessionLock: <T>(task: () => Promise<T>) => task(),
  publishBrowserSessionChange: vi.fn(),
  subscribeBrowserSessionChange: vi.fn(() => () => {}),
  subscribeBrowserSessionRestore: vi.fn(() => () => {}),
}))

import { queryClient } from '@/app/query-client'
import { ApiError } from '@/lib/api/client'
import { accessLifecycle } from '@/lib/query/access-lease'
import { publishBrowserSessionChange, supportsBrowserSessionLock } from '@/lib/browser-session'

import { useAuthStore } from './auth'

const tokens = {
  accessToken: 'access',
  refreshToken: null,
  expiresIn: 3600,
  tokenType: 'Bearer',
}

describe('auth logout state machine', () => {
  beforeEach(async () => {
    fetchCurrentUserRequest.mockReset()
    loginRequest.mockReset()
    logoutRequest.mockReset()
    refreshRequest.mockReset()
    vi.mocked(publishBrowserSessionChange).mockClear()
    vi.mocked(supportsBrowserSessionLock).mockReturnValue(true)
    queryClient.clear()
    await accessLifecycle.reset(0, queryClient)
    useAuthStore.setState({
      tokens,
      user: null,
      roles: [],
      perms: [],
      menus: [],
      meLoaded: false,
      bootstrapped: true,
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

  it('a server logout failure retains the authenticated identity for retry', async () => {
    logoutRequest.mockRejectedValue(new ApiError(50000, '注销服务暂不可用'))

    await expect(useAuthStore.getState().logout()).rejects.toMatchObject({ code: 50000 })

    expect(useAuthStore.getState().tokens).toEqual(tokens)
    expect(publishBrowserSessionChange).not.toHaveBeenCalled()
  })

  it('服务端撤销失败时也保留原账户查询缓存', async () => {
    queryClient.setQueryData(['calendar', 'contexts'], [{ id: 'current-account' }])
    logoutRequest.mockRejectedValue(new Error('注销失败'))

    await expect(useAuthStore.getState().logout()).rejects.toThrow('注销失败')

    expect(queryClient.getQueryData(['calendar', 'contexts'])).toEqual([{ id: 'current-account' }])
  })

  it('invalid-cookie logout clears local identity and cache without claiming server revocation', async () => {
    useAuthStore.setState({
      user: { id: '1', username: 'former', nickname: 'Former account' },
      roles: ['ROLE_FORMER'],
      perms: ['system:user:list'],
      meLoaded: true,
    })
    queryClient.setQueryData(['system', 'users'], [{ id: 'former-account-private-row' }])
    logoutRequest.mockRejectedValue(new ApiError(40100, '刷新凭据无效'))

    await expect(useAuthStore.getState().logout()).rejects.toMatchObject({ code: 40100 })

    expect(useAuthStore.getState()).toMatchObject({
      tokens: null,
      user: null,
      roles: [],
      perms: [],
      menus: [],
      meLoaded: false,
      bootstrapped: true,
      sessionEpoch: 1,
    })
    expect(queryClient.getQueryData(['system', 'users'])).toBeUndefined()
    expect(publishBrowserSessionChange).not.toHaveBeenCalled()
  })

  it('a stale logout 401 cannot clear a newer account or its cache', async () => {
    let rejectOlder!: (reason: Error) => void
    logoutRequest.mockImplementationOnce(
      () => new Promise<void>((_, reject) => (rejectOlder = reject)),
    )
    const olderLogout = useAuthStore.getState().logout()
    const newTokens = { ...tokens, accessToken: 'new-account-access' }
    loginRequest.mockResolvedValue(newTokens)
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '2', username: 'current', nickname: 'Current account' },
      roles: ['ROLE_CURRENT'],
      perms: ['system:user:list'],
      menus: [],
    })
    await useAuthStore.getState().login('current', 'test-only-password')
    queryClient.setQueryData(['system', 'users'], [{ id: 'current-account-row' }])
    vi.mocked(publishBrowserSessionChange).mockClear()

    rejectOlder(new ApiError(40100, '旧刷新凭据无效'))
    await expect(olderLogout).resolves.toBeUndefined()

    expect(useAuthStore.getState()).toMatchObject({
      tokens: newTokens,
      user: { id: '2' },
      meLoaded: true,
      bootstrapped: true,
    })
    expect(queryClient.getQueryData(['system', 'users'])).toEqual([{ id: 'current-account-row' }])
    expect(publishBrowserSessionChange).not.toHaveBeenCalled()
  })

  it('a logout 401 also respects a newer login attempt before its identity epoch advances', async () => {
    let rejectLogout!: (reason: Error) => void
    let finishLogin!: (value: typeof tokens) => void
    logoutRequest.mockImplementationOnce(
      () => new Promise<void>((_, reject) => (rejectLogout = reject)),
    )
    loginRequest.mockImplementationOnce(
      () => new Promise<typeof tokens>((resolve) => (finishLogin = resolve)),
    )
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '2', username: 'current', nickname: 'Current account' },
      roles: [],
      perms: [],
      menus: [],
    })
    const olderLogout = useAuthStore.getState().logout()
    const newerLogin = useAuthStore.getState().login('current', 'test-only-password')
    expect(useAuthStore.getState().sessionEpoch).toBe(0)

    rejectLogout(new ApiError(40100, '旧刷新凭据无效'))
    await expect(olderLogout).resolves.toBeUndefined()
    expect(useAuthStore.getState().tokens).toEqual(tokens)
    expect(publishBrowserSessionChange).not.toHaveBeenCalled()
    finishLogin({ ...tokens, accessToken: 'accepted-new-login' })
    await expect(newerLogin).resolves.toBe(true)
    expect(useAuthStore.getState().user?.id).toBe('2')
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

  it('a late rejected login cannot surface an error after a newer account wins', async () => {
    let rejectOlder!: (error: Error) => void
    loginRequest
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectOlder = reject)))
      .mockResolvedValueOnce({ ...tokens, accessToken: 'current-account-access' })
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '2', username: 'current-account' },
      roles: [],
      perms: [],
      menus: [],
    })
    const earlier = useAuthStore.getState().login('older-account', 'test-only-password')
    await useAuthStore.getState().login('current-account', 'test-only-password')
    rejectOlder(new Error('obsolete login failure'))
    await expect(earlier).resolves.toBe(false)
    expect(useAuthStore.getState()).toMatchObject({
      user: { id: '2' },
      meLoaded: true,
      bootstrapped: true,
    })
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

    expect(refreshRequest).toHaveBeenCalledWith()
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

  it('cookie identity rebinding clears all previous-account caches and advances the epoch', async () => {
    useAuthStore.setState({ user: { id: '1', username: 'old', nickname: 'Old' }, meLoaded: true })
    queryClient.setQueryData(['system', 'users'], [{ id: 'old-only' }])
    refreshRequest.mockResolvedValue({ ...tokens, accessToken: 'new-memory-access' })
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '2', username: 'new', nickname: 'New' },
      roles: [],
      perms: [],
      menus: [],
    })
    await expect(useAuthStore.getState().tryRefresh()).resolves.toBe(true)
    expect(useAuthStore.getState()).toMatchObject({
      user: { id: '2' },
      sessionEpoch: 1,
      meLoaded: true,
    })
    expect(queryClient.getQueryData(['system', 'users'])).toBeUndefined()
  })

  it('reload bootstraps from cookie without any persisted refresh token and joins concurrent calls', async () => {
    useAuthStore.setState({ tokens: null, user: null, bootstrapped: false })
    refreshRequest.mockResolvedValue({ ...tokens, accessToken: 'bootstrap-memory-access' })
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '1', username: 'fixture' },
      roles: [],
      perms: [],
      menus: [],
    })
    await Promise.all([useAuthStore.getState().bootstrap(), useAuthStore.getState().bootstrap()])
    expect(refreshRequest).toHaveBeenCalledOnce()
    expect(refreshRequest).toHaveBeenCalledWith()
    expect(useAuthStore.getState()).toMatchObject({
      user: { id: '1' },
      bootstrapped: true,
      meLoaded: true,
    })
  })

  it('unsupported Web Locks forces local relogin without any refresh or cookie clearing endpoint', async () => {
    vi.mocked(supportsBrowserSessionLock).mockReturnValue(false)
    await expect(useAuthStore.getState().tryRefresh()).resolves.toBe(false)
    expect(refreshRequest).not.toHaveBeenCalled()
    expect(logoutRequest).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      tokens: null,
      bootstrapped: true,
      meLoaded: false,
    })
  })

  it('a newer cross-tab bootstrap does not join an invalidated identity flight', async () => {
    let finishOld!: (value: typeof tokens) => void
    refreshRequest
      .mockImplementationOnce(() => new Promise<typeof tokens>((resolve) => (finishOld = resolve)))
      .mockResolvedValueOnce({ ...tokens, accessToken: 'current-cookie-access' })
    fetchCurrentUserRequest.mockResolvedValue({
      user: { id: '2', username: 'current-cookie-user' },
      roles: [],
      perms: [],
      menus: [],
    })
    useAuthStore.setState({ tokens: null, user: null, bootstrapped: false })
    const olderBootstrap = useAuthStore.getState().bootstrap()
    await vi.waitFor(() => expect(refreshRequest).toHaveBeenCalledOnce())

    // A session-change message invalidates all old ownership before reading today's cookie.
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ bootstrapped: false })
    await useAuthStore.getState().bootstrap()
    expect(refreshRequest).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState()).toMatchObject({
      user: { id: '2' },
      bootstrapped: true,
      meLoaded: true,
    })

    finishOld({ ...tokens, accessToken: 'obsolete-cookie-access' })
    await olderBootstrap
    expect(useAuthStore.getState().tokens?.accessToken).toBe('current-cookie-access')
  })
})
