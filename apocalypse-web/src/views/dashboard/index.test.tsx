import i18next from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ApiError } from '@/lib/api/client'
import { normalizeMenuNode, type MenuNode } from '@/lib/api/types'
import { getLoginInsights, getOperInsights } from '@/views/system/log/log-insight.api'
import { pageLoginLogs } from '@/views/system/log/login/login-log.api'
import { pageOperLogs } from '@/views/system/log/oper/oper-log.api'
import { listOnlineUsers } from '@/views/system/online/online.api'

import dashboardI18n from './i18n'
import DashboardPage from './index'
import { MobileDashboard } from './MobileDashboard'

const { auth, query } = vi.hoisted(() => ({
  auth: {
    user: { id: '9223372036854775001', username: 'morgan', nickname: 'Morgan' },
    perms: [] as string[],
    menus: [] as MenuNode[],
    meLoaded: true,
    sessionEpoch: 3,
  },
  query: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: Object.assign((select: (state: typeof auth) => unknown) => select(auth), {
    getState: () => auth,
  }),
}))
vi.mock('@/views/system/log/login/login-log.api', () => ({ pageLoginLogs: vi.fn() }))
vi.mock('@/views/system/log/log-insight.api', () => ({
  getLoginInsights: vi.fn(),
  getOperInsights: vi.fn(),
}))
vi.mock('@/views/system/log/oper/oper-log.api', () => ({ pageOperLogs: vi.fn() }))
vi.mock('@/views/system/online/online.api', () => ({ listOnlineUsers: vi.fn() }))
vi.mock('@/hooks/useDesktopViewport', () => ({ useDesktopViewport: () => true }))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: query,
}))

interface SourceResult {
  data: unknown
  error: unknown
  isPending: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
}

let sources: Record<string, SourceResult>
const ready = (data: unknown): SourceResult => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
})
const failure = (message: string, data?: unknown, code = 500): SourceResult => ({
  ...ready(data),
  error: new ApiError(code, message),
  isError: true,
})
const cachedLogin = {
  list: [
    {
      id: '9007199254740993',
      username: 'protected-actor',
      success: 1,
      loginTime: '2026-09-27T09:30:00',
      ip: '127.0.0.1',
    },
  ],
}

function windowOf(range: 'DAY' | 'WEEK' | 'MONTH', totals: number[]) {
  return {
    range,
    bucketUnit: range === 'DAY' ? 'HOURS' : 'DAYS',
    zone: 'Asia/Shanghai',
    utcOffset: '+08:00',
    from: '2026-10-17 22:00:00',
    to: '2026-10-18 21:30:05',
    retentionStart: '2026-04-21 21:30:05',
    previousCovered: true,
    previousTotal: 0,
    buckets: totals.map((total, index) => ({
      start: `2026-10-18 ${String(index).padStart(2, '0')}:00:00`,
      total,
      succeeded: total,
      failed: 0,
    })),
  }
}
const loginInsights = (totals: number[] = [], extra: Record<string, unknown> = {}) => ({
  ...windowOf('DAY', totals),
  total: totals.reduce((sum, value) => sum + value, 0),
  succeeded: totals.reduce((sum, value) => sum + value, 0),
  failed: 0,
  distinctUsers: 0,
  distinctIps: 0,
  peak: Math.max(0, ...totals),
  average: 0,
  ...extra,
})
const operInsights = (total = 0, extra: Record<string, unknown> = {}) => ({
  ...windowOf('DAY', []),
  total,
  succeeded: total,
  failed: 0,
  unknown: 0,
  successRate: total ? 100 : null,
  byBusinessType: [],
  ...extra,
})

async function render(language = 'en', mobile = false) {
  const instance = i18next.createInstance()
  await instance.init({
    lng: language,
    fallbackLng: 'zh',
    defaultNS: 'translation',
    resources: {
      zh: { dashboard: dashboardI18n.resources.zh, translation: {} },
      en: { dashboard: dashboardI18n.resources.en, translation: {} },
    },
    interpolation: { escapeValue: false },
  })
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={instance}>
        <MemoryRouter>{mobile ? <MobileDashboard /> : <DashboardPage />}</MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  auth.perms = ['system:log:login', 'system:log:oper', 'system:online:list']
  auth.menus = []
  auth.meLoaded = true
  auth.sessionEpoch = 3
  auth.user.id = '9223372036854775001'
  vi.mocked(pageLoginLogs).mockReset().mockResolvedValue({ list: [], total: 0, page: 1, size: 200 })
  vi.mocked(pageOperLogs).mockReset().mockResolvedValue({ list: [], total: 0, page: 1, size: 200 })
  vi.mocked(listOnlineUsers).mockReset().mockResolvedValue([])
  vi.mocked(getLoginInsights)
    .mockReset()
    .mockResolvedValue(loginInsights() as never)
  vi.mocked(getOperInsights)
    .mockReset()
    .mockResolvedValue(operInsights() as never)
  sources = {
    'login-logs': ready({ list: [] }),
    'oper-logs': ready({ list: [] }),
    'online-users': ready([]),
    'login-insights': ready(loginInsights()),
    'oper-insights': ready(operInsights()),
  }
  query.mockReset()
  query.mockImplementation(({ queryKey }: { queryKey: string[] }) => sources[queryKey[1]])
})

describe('dashboard truthful source states', () => {
  it('shows initial failures without an empty activity or zero-session claim', async () => {
    sources['login-logs'] = failure('登录日志服务不可用')
    sources['oper-logs'] = failure('操作日志服务不可用')
    sources['login-insights'] = failure('登录统计服务不可用')
    sources['oper-insights'] = failure('操作统计服务不可用')
    sources['online-users'] = failure('会话服务不可用')
    const html = await render()
    expect(html).toContain('登录日志服务不可用')
    expect(html).toContain('登录统计服务不可用')
    expect(html).toContain('Could not load Login records')
    expect(html).not.toContain('No sign-ins in this range')
    expect(html).toContain('Retry')
    expect(html).not.toContain('No activity yet')
    expect(html).not.toContain('No active sessions')
    expect(html).not.toContain('data-slot="session-count"')
  })

  it('captions the login and operation totals with their own subjects', async () => {
    const html = await render()
    expect(html).toContain('Sign-ins in the last 24 hours, by hour')
    expect(html).toContain('Operation records in the last 24 hours, by hour')
  })

  it('distinguishes a confirmed empty result from failure', async () => {
    const html = await render()
    expect(html).toContain('No activity yet')
    expect(html).toContain('No active sessions')
    expect(html).not.toContain('role="alert"')
  })

  it('does not display cached data after permissions are removed', async () => {
    auth.perms = []
    sources['login-logs'] = ready(cachedLogin)
    sources['online-users'] = ready([{ username: 'protected-actor' }])
    const html = await render()
    expect(html).toContain('does not have permission to view audit records')
    expect(html).toContain('does not have permission to view online sessions')
    expect(html).not.toContain('protected-actor')
    expect(html).not.toContain('data-slot="session-count"')
    expect(query.mock.calls.every(([options]) => options.enabled === false)).toBe(true)
  })

  it('hides protected data while the current user view is being refreshed', async () => {
    auth.meLoaded = false
    sources['login-logs'] = ready(cachedLogin)
    expect(await render()).not.toContain('protected-actor')
    expect(query.mock.calls.every(([options]) => options.enabled === false)).toBe(true)
  })

  it('retains a readable source when another source fails', async () => {
    sources['login-logs'] = ready(cachedLogin)
    sources['oper-logs'] = failure('Operation source unavailable')
    const html = await render()
    expect(html).toContain('protected-actor')
    expect(html).toContain('Operation source unavailable')
    expect(html).not.toContain('No activity yet')
  })

  it('labels retained activity after a recoverable refresh error', async () => {
    sources['login-logs'] = failure('Network unavailable', cachedLogin)
    const html = await render()
    expect(html).toContain('protected-actor')
    expect(html).toContain('Showing the last loaded content')
  })

  it('hides the retained activity when the backend denies access', async () => {
    sources['login-logs'] = failure('Access removed', cachedLogin, 40300)
    const html = await render()
    expect(html).toContain('Access removed')
    expect(html).not.toContain('protected-actor')
    expect(html).not.toContain('Showing the last loaded content')
  })

  it('keeps source loading distinct from an empty result', async () => {
    sources['login-logs'] = { ...ready(undefined), isPending: true, isFetching: true }
    const html = await render()
    expect(html).toContain('Loading…')
    expect(html).not.toContain('No activity yet')
  })

  it('renders both locales without leaking semantic keys or Chinese UI copy into English', async () => {
    const english = await render()
    expect(english).toContain('Common tasks')
    expect(english).toContain('Recent activity')
    expect(english).not.toMatch(/近期|常用任务|在线会话|暂无|dashboard\./)
    const chinese = await render('zh')
    expect(chinese).toContain('常用任务')
    expect(chinese).toContain('暂无活动记录')
  })

  it('uses configured task URLs and names without treating the name as an identifier', async () => {
    auth.menus = [
      normalizeMenuNode({
        id: '1',
        parentId: '0',
        menuName: 'People & accounts',
        type: 'M',
        path: '/team/accounts',
        component: 'system/user/index',
        perms: 'system:user:list',
        icon: 'user',
        sort: 0,
      }),
    ]
    const html = await render()
    expect(html).toContain('href="/team/accounts"')
    expect(html).toContain('People &amp; accounts')
  })

  it('does not offer a task whose frontend page is not installed', async () => {
    auth.menus = [
      normalizeMenuNode({
        id: '1',
        parentId: '0',
        menuName: 'Unavailable task',
        type: 'M',
        path: '/unavailable-task',
        component: 'uninstalled/task/index',
        perms: null,
        icon: null,
        sort: 0,
      }),
    ]
    const html = await render()
    expect(html).not.toContain('href="/unavailable-task"')
    expect(html).toContain('No task pages are available')
  })

  it('preserves and escapes user-supplied operation titles', async () => {
    sources['oper-logs'] = ready({
      list: [
        {
          id: '9007199254740993',
          title: 'Custom <operation> & title',
          operName: 'Morgan',
          operIp: null,
          status: 1,
          operTime: '2026-09-27T09:30:00',
        },
      ],
    })
    const html = await render()
    expect(html).toContain('Custom &lt;operation&gt; &amp; title')
    expect(html).not.toContain('Custom <operation>')
  })

  it('states the server range, time zone and half-open window with full totals', async () => {
    sources['login-insights'] = ready(
      loginInsights([2, 0, 5], { total: 9876, previousTotal: 4938, distinctUsers: 12 }),
    )
    const html = await render()
    expect(html).toContain('Last 24 hours')
    expect(html).toContain('Last 7 days')
    expect(html).toContain('Last 30 days')
    expect(html).toContain('9,876')
    expect(html).toContain('2× previous period')
    expect(html).toContain('title="This period 9876, previous period 4938"')
    expect(html).toContain('UTC+08:00')
    expect(html).toContain('From 2026-10-17 22:00:00 up to 2026-10-18 21:30:05')
    expect(html).toContain('class="dashboard-trend-line"')
    expect(html).not.toMatch(/Latest 200|Sampled records/)
  })

  it('does not claim a comparison when the previous window is not retained', async () => {
    sources['login-insights'] = ready(loginInsights([1], { previousCovered: false }))
    const html = await render()
    expect(html).toContain('Previous period not fully retained')
    expect(html).not.toContain('vs previous period')
  })

  it('keeps an empty range distinct from failure and never shows a 100% rate for zero records', async () => {
    const html = await render()
    expect(html).toContain('No sign-ins in this range.')
    expect(html).toContain('No operation records in this range.')
    expect(html.replace(/<[^>]*>/g, '')).not.toContain('100.0')
    expect(html).not.toContain('NaN')
  })
})

interface CapturedQuery {
  queryKey: readonly unknown[]
  queryFn: (request: { signal: AbortSignal }) => Promise<unknown>
  enabled: boolean
}

function sourceQuery(name: string): CapturedQuery {
  const call = query.mock.calls.find(([options]) => options.queryKey[1] === name)
  if (!call) throw new Error(`Missing query for ${name}`)
  return call[0] as CapturedQuery
}

describe('dashboard bounded source lifecycle', () => {
  it('requests one bounded first page per log source and forwards the query signal', async () => {
    await render()
    const controller = new AbortController()
    for (const name of [
      'login-logs',
      'oper-logs',
      'online-users',
      'login-insights',
      'oper-insights',
    ]) {
      const options = sourceQuery(name)
      expect(options.queryKey).toContain(auth.sessionEpoch)
      expect(options.queryKey).toContain(auth.user.id)
      await options.queryFn({ signal: controller.signal })
    }
    expect(pageLoginLogs).toHaveBeenCalledExactlyOnceWith(1, 6, undefined, controller.signal)
    expect(pageOperLogs).toHaveBeenCalledExactlyOnceWith(1, 6, undefined, controller.signal)
    expect(listOnlineUsers).toHaveBeenCalledExactlyOnceWith({ signal: controller.signal })
    expect(getLoginInsights).toHaveBeenCalledExactlyOnceWith('DAY', controller.signal)
    expect(getOperInsights).toHaveBeenCalledExactlyOnceWith('DAY', controller.signal)
  })

  it.each(['revoke', 'refresh', 'identity', 'abort'] as const)(
    'rejects a late login source result after %s',
    async (change) => {
      let finish: (() => void) | undefined
      vi.mocked(pageLoginLogs).mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ list: [], total: 0, page: 1, size: 200 })
          }),
      )
      await render()
      const controller = new AbortController()
      const pending = sourceQuery('login-logs').queryFn({ signal: controller.signal })
      if (change === 'revoke') auth.perms = []
      if (change === 'refresh') auth.meLoaded = false
      if (change === 'identity') auth.sessionEpoch++
      if (change === 'abort') controller.abort()
      finish?.()
      await expect(pending).rejects.toMatchObject({ name: 'CanceledError' })
    },
  )
})

describe('unchanged mobile dashboard', () => {
  it('keeps the previous layout and omits desktop statistics and sample controls', async () => {
    const html = await render('en', true)
    expect(html).toContain('Common tasks')
    expect(html).toContain('Recent activity')
    expect(html).toContain('Up to 4 recent records per available source')
    expect(html).not.toContain('Reporting range')
    expect(html).not.toContain('Audit operation success')
    expect(html).not.toContain('Inspect activity:')
    expect(html.indexOf('/brand/hero-light.png')).toBeLessThan(
      html.indexOf('dashboard-tasks-title'),
    )
    expect(html.indexOf('dashboard-tasks-title')).toBeLessThan(
      html.indexOf('dashboard-activity-title'),
    )
  })

  it('reads only four records per source and isolates that cache from the desktop request', async () => {
    await render('en', true)
    const controller = new AbortController()
    const loginQuery = sourceQuery('login-logs')
    const operQuery = sourceQuery('oper-logs')
    expect(loginQuery.queryKey.at(-1)).toBe(4)
    expect(operQuery.queryKey.at(-1)).toBe(4)
    await loginQuery.queryFn({ signal: controller.signal })
    await operQuery.queryFn({ signal: controller.signal })
    expect(pageLoginLogs).toHaveBeenCalledExactlyOnceWith(1, 4, undefined, controller.signal)
    expect(pageOperLogs).toHaveBeenCalledExactlyOnceWith(1, 4, undefined, controller.signal)
  })

  it('retains the existing source denial and empty/failure semantics', async () => {
    auth.perms = []
    sources['login-logs'] = ready(cachedLogin)
    const html = await render('en', true)
    expect(html).toContain('does not have permission to view audit records')
    expect(html).not.toContain('protected-actor')
    expect(html).not.toContain('data-slot="session-count"')
  })
})
