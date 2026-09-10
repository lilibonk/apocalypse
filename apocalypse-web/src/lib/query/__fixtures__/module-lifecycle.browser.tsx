import { act, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { notifyManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { type AxiosAdapter } from 'axios'

import { DynaPage } from '@/components/dyna/DynaPage'
import type { DynaPageSchema } from '@/components/dyna/schema'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ApiError, configureClient, http, request } from '@/lib/api/client'
import { normalizeMenuNode } from '@/lib/api/types'
import { useAuthStore } from '@/stores/auth'
import i18n from '@/i18n'
import { calendarQueries, calendarScope } from '@/views/calendar/calendar.queries'
import { accessLifecycle } from '../access-lease'
import { ModuleScope } from '../module-scope'
import { ModuleAccess } from '../ModuleAccess'
import { useModuleMutation } from '../use-module-mutation'
import { MemoryRouter, Routes } from 'react-router'
import { useMenuRoutes } from '@/routes/menu-routes'
import { useResourceDenial } from '../use-resource-denial'
import '@/index.css'

if (!import.meta.env.DEV) throw new Error('Test fixture is dev-only')
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
notifyManager.setScheduler(queueMicrotask)
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })
const root = createRoot(document.getElementById('root')!)
const status = document.getElementById('status')!
const results: string[] = []
const fixture = new ModuleScope('fixture')
const menus = ['calendar', 'fixture'].map((moduleKey) =>
  normalizeMenuNode({
    id: moduleKey,
    parentId: '0',
    menuName: moduleKey,
    type: 'M',
    path: moduleKey,
    component: `${moduleKey}/index`,
    moduleKey,
    perms: null,
    icon: null,
    sort: 0,
  }),
)
const perms = [
  ...calendarScope.requiredPerms,
  'fixture:record:list',
  'fixture:record:edit',
  'fixture:record:download',
]
let principal = 0
let effects = 0
let errors = 0
let settled = 0
let downloads = 0
let ignoredResolve: (value: string) => void = () => {
  throw new Error('No pending operation')
}
let ignoredReject: (error: Error) => void = () => {
  throw new Error('No pending operation')
}
let operationSignal: AbortSignal | undefined
let querySignal: AbortSignal | undefined
let releaseNetwork: () => void = () => {
  throw new Error('No pending request')
}
let slowNetwork = false
let denyNetwork = false
let sent = 0

const record = fixture.query(
  'record',
  ['fixture:record:list'],
  (params: { id: string }, transport) =>
    request<{ name: string }>(`/fixture/record/${params.id}`, transport),
)
const ignoredOperation = fixture.operation(['fixture:record:edit'], (transport) => {
  operationSignal = transport.signal
  return new Promise<string>((yes, no) => {
    ignoredResolve = yes
    ignoredReject = no
  })
})
const downloadOperation = fixture.operation(
  ['fixture:record:download'],
  (transport, _row: Record<string, unknown>) => {
    void _row
    operationSignal = transport.signal
    return new Promise<string>((yes, no) => {
      ignoredResolve = yes
      ignoredReject = no
    })
  },
)

const adapter: AxiosAdapter = async (config) => {
  sent++
  if (!config.url?.startsWith('/fixture/') && !config.url?.startsWith('/system/dict/'))
    throw new Error(`Unexpected request: ${config.url}`)
  if (denyNetwork && config.url?.startsWith('/fixture/record/'))
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { code: 40300, message: 'Object access revoked' },
    }
  if (slowNetwork && config.url?.startsWith('/fixture/record/')) {
    querySignal = config.signal as AbortSignal
    await new Promise<void>((done) => {
      releaseNetwork = done
    })
  }
  const data = config.url?.includes('/records/page')
    ? {
        list: [{ id: '1', name: 'Dyna fixture record' }],
        total: 25,
        page: Number(config.params?.page ?? 1),
        size: Number(config.params?.size ?? 10),
      }
    : config.url?.startsWith('/system/dict/')
      ? []
      : { name: 'Current fixture record' }
  return { status: 200, statusText: 'OK', headers: {}, config, data: { code: 0, data } }
}
http.defaults.adapter = adapter
configureClient({
  getAccessToken: () => `test-principal-${principal}`,
  getPrincipalEpoch: () => principal,
  tryRefresh: async () => false,
  onUnauthorized: () => {
    throw new Error('Unexpected logout')
  },
})

export function Probe({ generation, id = '1' }: { generation: string; id?: string }) {
  const query = useQuery(record({ id }))
  const [effect, setEffect] = useState('none')
  const onDenied = useResourceDenial({
    errors: [query.error],
    clear: record.filter({ id }),
    reset: () => setEffect('denied'),
  })
  const mutation = useModuleMutation(fixture, {
    onDenied,
    localKey: generation,
    mutationFn: (run) => run(ignoredOperation),
    onSuccess: (value) => {
      effects++
      setEffect(value)
    },
    onError: () => {
      errors++
    },
    onSettled: () => {
      settled++
    },
  })
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <p data-record>{query.data?.name ?? 'Loading'}</p>
      <p data-effect>{effect}</p>
      <button
        data-run
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        onClick={() => mutation.mutate()}
      >
        Start delayed operation
      </button>
    </section>
  )
}

function MenuProbe() {
  const { routeElements } = useMenuRoutes()
  return (
    <MemoryRouter initialEntries={['/fixture']}>
      <Routes>{routeElements}</Routes>
    </MemoryRouter>
  )
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
function pass(message: string) {
  results.push(`PASS ${message}`)
  status.textContent = results.join('\n')
}
async function render(children: ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>,
    )
  })
}
async function authorize(nextPerms = perms, moduleMenus = menus) {
  await act(async () => {
    useAuthStore.setState({
      sessionEpoch: principal,
      tokens: null,
      user: { id: 'test', username: 'test', nickname: 'Test' },
      perms: nextPerms,
      menus: moduleMenus,
      meLoaded: true,
    })
    await accessLifecycle.accept(principal, moduleMenus, nextPerms, client)
  })
}
async function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector)
  assert(button, `Missing button ${selector}`)
  await act(async () => {
    button.click()
  })
}
function probe(generation: string, id = '1') {
  return (
    <ModuleAccess scope={fixture}>
      <Probe generation={generation} id={id} />
    </ModuleAccess>
  )
}

async function run() {
  accessLifecycle.reset(principal, client)
  await i18n.changeLanguage('zh')
  await authorize()
  const calendar = calendarQueries.contexts({})
  client
    .getQueryCache()
    .build(client, { queryKey: calendar.queryKey, meta: calendar.meta })
    .setData([{ id: 'core-calendar' }])
  client.setQueryData(['dict', 'shared'], 'shared dictionary')
  await render(probe('first'))
  assert(
    document.querySelector('[data-record]')?.textContent === 'Current fixture record',
    'Query did not render',
  )
  pass('Native query renders through scope → request → Axios')

  await click('[data-run]')
  assert(operationSignal, 'Operation did not start')
  await authorize(perms.filter((perm) => perm !== 'fixture:record:edit'))
  assert(operationSignal.aborted, 'Partial withdrawal did not abort the operation')
  assert(client.getMutationCache().getAll().length === 0, 'Revoked mutation remained in cache')
  await authorize()
  await act(async () => {
    ignoredResolve('OLD SECRET')
  })
  assert(effects === 0 && errors === 0 && settled === 0, 'Old callbacks ran after re-grant')
  assert(!document.body.textContent?.includes('OLD SECRET'), 'Old data returned to DOM')
  pass('Partial revoke/re-grant aborts work and suppresses all late callbacks/cache/DOM writes')

  await render(probe('editor-A'))
  await click('[data-run]')
  await render(probe('editor-B'))
  await act(async () => {
    ignoredReject(new Error('late old editor error'))
  })
  assert(effects === 0 && errors === 0 && settled === 0, 'Old editor callbacks ran')
  pass('Editor generation change blocks late error and settled effects')

  await render(probe('object-denial'))
  await click('[data-run]')
  const oldResolve = ignoredResolve
  await click('[data-run]')
  await act(async () => ignoredReject(new ApiError(40300, 'Object access revoked')))
  await act(async () => oldResolve('REVOKED OBJECT SECRET'))
  assert(
    !document.body.textContent?.includes('REVOKED OBJECT SECRET'),
    'Object denial did not invalidate sibling callbacks',
  )
  assert(
    document.querySelector('[data-effect]')?.textContent === 'denied',
    'Editor context was not reset',
  )
  assert(
    client.getQueryData(record({ id: '1' }).queryKey) === undefined,
    'Denied resource retained cached data',
  )
  pass(
    'Object mutation denial clears resource/editor and suppresses sibling late results without changing /me',
  )

  await act(async () => client.invalidateQueries(record.filter({ id: '1' })))
  assert(
    document.querySelector('[data-record]')?.textContent === 'Current fixture record',
    'Explicit retry failed',
  )
  denyNetwork = true
  const sentBeforeDenial = sent
  await act(async () => client.invalidateQueries(record.filter({ id: '1' })))
  assert(
    !document.querySelector('[data-record]')?.textContent?.includes('Current fixture record'),
    'Denied query kept old DOM data',
  )
  assert(
    client.getQueryData(record({ id: '1' }).queryKey) === undefined,
    'Denied query kept old cached data',
  )
  assert(sent === sentBeforeDenial + 1, 'Denial triggered an automatic retry loop')
  assert(
    client.getQueryData(calendar.queryKey) !== undefined,
    'Object denial cleared another module',
  )
  assert(
    client.getQueryData(['dict', 'shared']) === 'shared dictionary',
    'Object denial cleared core data',
  )
  denyNetwork = false
  pass(
    'Object query 403 removes stale DOM/cache, preserves other ownership and does not refetch-loop',
  )

  slowNetwork = true
  await render(probe('slow', '2'))
  assert(querySignal, 'Delayed network request did not reach adapter')
  await authorize(perms, [menus[0]!])
  assert(querySignal.aborted, 'Axios signal did not abort')
  await act(async () => {
    releaseNetwork()
  })
  assert(!document.querySelector('[data-record]'), 'Revoked module stayed mounted')
  assert(
    client
      .getQueryCache()
      .getAll()
      .every((query) => query.meta?.moduleKey !== 'fixture'),
    'Revoked query remained cached',
  )
  assert(
    client.getQueryData(calendar.queryKey) !== undefined,
    'Unrelated Calendar cache was removed',
  )
  assert(
    client.getQueryData(['dict', 'shared']) === 'shared dictionary',
    'Core dictionary was removed',
  )
  pass('Full withdrawal hides DOM, aborts actual network and preserves Calendar/core cache')

  slowNetwork = false
  await authorize()
  await render(probe('identity-A'))
  await click('[data-run]')
  await act(async () => {
    principal++
    await accessLifecycle.reset(principal, client)
  })
  await authorize()
  await act(async () => {
    ignoredResolve('ACCOUNT A SECRET')
  })
  assert(
    effects === 0 && !document.body.textContent?.includes('ACCOUNT A SECRET'),
    'Account A affected B',
  )
  pass('Identity switch never accepts previous-principal mutation results')

  const requestsBeforeMissing = sent
  await render(<MenuProbe />)
  assert(
    document.querySelector('#root [role="status"]')?.textContent === i18n.t('route.notInstalled'),
    'Missing local page did not fail closed',
  )
  assert(sent === requestsBeforeMissing, 'Missing page called a module API')
  pass('Actual menu router shows missing-page status without issuing a module request')

  const schema: DynaPageSchema = {
    key: 'fixture-records',
    endpoint: '/fixture/records',
    title: 'Dyna fixture',
    listPerm: 'fixture:record:list',
    pageSize: 10,
    columns: [{ key: 'name', title: 'Name' }],
    rowActions: [
      {
        kind: 'custom',
        key: 'download',
        label: 'Delayed download',
        perm: 'fixture:record:download',
      },
    ],
  }
  const customActions = {
    download: {
      operation: downloadOperation,
      onSuccess: () => {
        downloads++
      },
    },
  }
  await render(<DynaPage schema={schema} queryScope={fixture} customActions={customActions} />)
  assert(document.body.textContent?.includes('Dyna fixture record'), 'Dyna list did not render')
  await click('button[aria-label="Delayed download"]')
  await authorize(perms.filter((perm) => perm !== 'fixture:record:download'))
  assert(operationSignal?.aborted, 'Dyna download did not abort')
  await authorize()
  await act(async () => {
    ignoredResolve('file content')
  })
  assert(downloads === 0, 'Revoked download saved a file')
  pass('Dyna custom download shares scope and suppresses post-revocation save effect')

  await act(async () => {
    document.documentElement.classList.add('dark')
    await i18n.changeLanguage('en')
  })
  assert(
    document.body.textContent?.includes('Dyna fixture record'),
    'Theme/locale switch lost valid data',
  )
  pass('Dyna remains usable in dark / English with stable ownership')
  await act(async () => {
    document.documentElement.classList.remove('dark')
    await i18n.changeLanguage('zh')
  })
  const button = document.querySelector<HTMLButtonElement>('button[aria-label="Delayed download"]')!
  button.focus()
  assert(document.activeElement === button, 'Keyboard focus is unavailable')
  pass('Dyna remains usable in light / Chinese and exposes keyboard-focusable actions')
  status.textContent = `ALL ${results.length} CHECKS PASSED · ${sent} intercepted requests\n${results.join('\n')}`
  document.title = 'PASS — Optional module lifecycle'
}
void run().catch((error: unknown) => {
  status.textContent = `FAIL ${error instanceof Error ? error.stack : String(error)}\n${results.join('\n')}`
  document.title = 'FAIL — Optional module lifecycle'
})
