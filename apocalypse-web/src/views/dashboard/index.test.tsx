import i18next from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'
import { normalizeMenuNode, type MenuNode } from '@/lib/api/types'

import dashboardI18n from './i18n'
import DashboardPage from './index'

const { auth, query } = vi.hoisted(() => ({
  auth: {
    user: { username: 'morgan', nickname: 'Morgan' },
    perms: [] as string[],
    menus: [] as MenuNode[],
    meLoaded: true,
  },
  query: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: (select: (state: typeof auth) => unknown) => select(auth),
}))
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

async function render(language = 'en') {
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
    <I18nextProvider i18n={instance}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  auth.perms = ['system:log:login', 'system:log:oper', 'system:online:list']
  auth.menus = []
  auth.meLoaded = true
  sources = {
    'login-logs': ready({ list: [] }),
    'oper-logs': ready({ list: [] }),
    'online-users': ready([]),
  }
  query.mockReset()
  query.mockImplementation(({ queryKey }: { queryKey: string[] }) => sources[queryKey[1]])
})

describe('dashboard truthful source states', () => {
  it('shows initial failures without an empty activity or zero-session claim', async () => {
    sources['login-logs'] = failure('登录日志服务不可用')
    sources['oper-logs'] = failure('操作日志服务不可用')
    sources['online-users'] = failure('会话服务不可用')
    const html = await render()
    expect(html).toContain('登录日志服务不可用')
    expect(html).toContain('Could not load Login records')
    expect(html).toContain('Retry')
    expect(html).not.toContain('No activity yet')
    expect(html).not.toContain('No active sessions')
    expect(html).not.toContain('data-slot="session-count"')
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
})
