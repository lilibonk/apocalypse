import { QueryClient, QueryObserver, type QueryObserverOptions } from '@tanstack/react-query'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/client'
import { normalizeMenuNode, type PageResult } from '@/lib/api/types'
import { accessLifecycle } from '@/lib/query/access-lease'
import { ModuleAccess } from '@/lib/query/ModuleAccess'
import { ModuleScope } from '@/lib/query/module-scope'
import type { ResourceDenialHandler } from '@/lib/query/use-resource-denial'

import { createDynaQueries } from '../dyna-queries'
import { DynaForm } from '../DynaForm'
import { DynaPage, type DynaPageProps } from '../DynaPage'
import { DynaTable, type DynaTableProps } from '../DynaTable'
import type { DynaPageSchema } from '../schema'

type Dataset = PageResult<Record<string, unknown>>
const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  stateIndex: 0,
  refIndex: 0,
  effects: [] as (() => void)[],
  mutations: [] as { onDenied?: ResourceDenialHandler }[],
  principalEpoch: 1,
  request: vi.fn(),
}))

// Exercise the page's callbacks across renders without installing a DOM dependency.
// QueryObserver and the resource-denial hook remain real, including cache cancellation.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: <T,>(factory: () => T) => factory(),
  useState: <T,>(initial: T | (() => T)) => {
    const index = harness.stateIndex++
    if (!(index in harness.states))
      harness.states[index] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [
      harness.states[index],
      (next: T | ((previous: T) => T)) => {
        harness.states[index] =
          typeof next === 'function'
            ? (next as (previous: T) => T)(harness.states[index] as T)
            : next
      },
    ]
  },
  useRef: <T,>(initial: T) => {
    const index = harness.refIndex++
    return (harness.refs[index] ??= { current: initial })
  },
  useLayoutEffect: (effect: () => void) => harness.effects.push(effect),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => client,
  useQuery: (options: QueryObserverOptions<Dataset>) => {
    if (!observer) {
      observer = new QueryObserver(client, options)
      unsubscribe = observer.subscribe(() => {})
    } else observer.setOptions(options)
    return observer.getCurrentResult()
  },
}))
vi.mock('@/lib/query/use-module-mutation', () => ({
  useModuleMutation: (_scope: unknown, options: { onDenied?: ResourceDenialHandler }) => {
    harness.mutations.push(options)
    return { mutate: vi.fn(), isPending: false }
  },
}))
vi.mock('@/lib/api/client', async (original) => ({
  ...(await original<typeof import('@/lib/api/client')>()),
  request: harness.request,
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: { sessionEpoch: number }) => unknown) =>
    selector({ sessionEpoch: harness.principalEpoch }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const schema: DynaPageSchema = {
  key: 'users',
  endpoint: '/system/users',
  title: 'Users',
  listPerm: 'system:user:list',
  columns: [{ key: 'nickname', title: 'Nickname' }],
  rowActions: [{ kind: 'edit' }],
  form: { fields: [{ name: 'nickname', label: 'Nickname', type: 'input' }] },
}
const row = { id: '1', nickname: 'Private record' }
const dataset: Dataset = { list: [row], total: 1, page: 1, size: 10 }
let client: QueryClient
let observer: QueryObserver<Dataset> | undefined
let unsubscribe: (() => void) | undefined
let mountKey: string | null

function find<P>(node: ReactNode, type: unknown): ReactElement<P> {
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return find<P>(child, type)
      } catch {
        // Continue through siblings.
      }
    }
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.type === type) return node as ReactElement<P>
    return find<P>(node.props.children, type)
  }
  throw new Error('Component not found')
}

function unmount() {
  harness.states.length = 0
  harness.refs.length = 0
  unsubscribe?.()
  observer = undefined
  unsubscribe = undefined
}

function renderPage(queryScope?: ModuleScope) {
  const root = DynaPage({ schema, queryScope })
  let content = root as ReactElement<DynaPageProps>
  let boundary = ''
  if (root.type === ModuleAccess) {
    const module = ModuleAccess(root.props)
    if (!module) {
      unmount()
      mountKey = null
      return null
    }
    boundary = String(module.key)
    content = (module as ReactElement<{ children: ReactElement<DynaPageProps> }>).props.children
  }
  const nextMount = `${boundary}:${String(content.key)}`
  if (mountKey !== nextMount) unmount()
  mountKey = nextMount
  harness.stateIndex = 0
  harness.refIndex = 0
  harness.effects.length = 0
  harness.mutations.length = 0
  const Component = content.type as (props: DynaPageProps) => ReactNode
  const tree = Component(content.props)
  for (const effect of harness.effects) effect()
  return {
    table: find<DynaTableProps>(tree, DynaTable).props,
    form: find<{ open: boolean }>(tree, DynaForm).props,
  }
}

function seed(queryScope?: ModuleScope) {
  const options = createDynaQueries(schema, queryScope).list(
    { schemaKey: schema.key, endpoint: schema.endpoint, page: 1, size: 10, search: {} },
    true,
  )
  client.setQueryData(options.queryKey, dataset)
  return options.queryKey
}

function deny(error: ApiError, queryScope?: ModuleScope) {
  const page = renderPage(queryScope)!
  const edit = find<{ onClick: () => void }>(page.table.actions?.(row), Button)
  edit.props.onClick()
  expect(renderPage(queryScope)?.form.open).toBe(true)
  harness.mutations[0]!.onDenied!.handle(error)
  return renderPage(queryScope)!
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  mountKey = null
  harness.principalEpoch = 1
  harness.request.mockReset().mockResolvedValue(dataset)
})
afterEach(() => {
  unmount()
  client.clear()
})

describe('Dyna mutation denial recovery', () => {
  it.each([403, 40300, 404, 40400])(
    'keeps denial %s visible after cache clearing and closes the old editor without refetching',
    (code) => {
      const key = seed()
      client.setQueryData(['unrelated'], 'keep')
      const error = new ApiError(code, 'The edited object is no longer accessible')
      const page = deny(error)

      expect(client.getQueryData(key)).toBeUndefined()
      expect(client.getQueryData(['unrelated'])).toBe('keep')
      expect(page.form.open).toBe(false)
      expect(page.table.error).toBe(error)
      expect(page.table.rows).toBeUndefined()
      expect(page.table.onRetry).toBeTypeOf('function')
      expect(harness.request).not.toHaveBeenCalled()
    },
  )

  it.each([40300, 50000])(
    'keeps feedback through retry failure %s until a retry succeeds',
    async (code) => {
      seed()
      const denied = new ApiError(40400, 'Deleted by another administrator')
      let page = deny(denied)
      let rejectRetry!: (error: Error) => void
      harness.request.mockImplementationOnce(
        () => new Promise((_, reject) => (rejectRetry = reject)),
      )
      page.table.onRetry?.()
      await vi.waitFor(() => expect(harness.request).toHaveBeenCalledOnce())
      page = renderPage()!
      expect(page.table.error).toBe(denied)
      expect(page.table.refreshing).toBe(true)

      const outage = new ApiError(code, 'Retry is still unavailable')
      rejectRetry(outage)
      await vi.waitFor(() => expect(observer?.getCurrentResult().isFetching).toBe(false))
      page = renderPage()!
      expect(page.table.error).toBe(outage)
      expect(page.table.rows).toBeUndefined()
      expect(harness.request).toHaveBeenCalledOnce()

      harness.request.mockResolvedValueOnce({ ...dataset, list: [], total: 0 })
      page.table.onRetry?.()
      await vi.waitFor(() => expect(observer?.getCurrentResult().isSuccess).toBe(true))
      page = renderPage()!
      expect(page.table.error).toBeNull()
      expect(page.table.rows).toEqual([])
      expect(harness.request).toHaveBeenCalledTimes(2)
    },
  )

  it('does not let an older retry clear a newer mutation denial', async () => {
    seed()
    const first = new ApiError(40400, 'Original object was deleted')
    const newer = new ApiError(40300, 'A newer operation was denied')
    const page = deny(first)
    let finishRetry!: (value: Dataset) => void
    harness.request.mockImplementationOnce(() => new Promise((resolve) => (finishRetry = resolve)))
    page.table.onRetry?.()
    await vi.waitFor(() => expect(harness.request).toHaveBeenCalledOnce())
    renderPage()
    harness.mutations[0]!.onDenied!.handle(newer)
    finishRetry(dataset)
    await vi.waitFor(() => expect(observer?.getCurrentResult().isFetching).toBe(false))

    const denied = renderPage()!
    expect(denied.table.error).toBe(newer)
    expect(denied.table.rows).toBeUndefined()
    expect(harness.request).toHaveBeenCalledOnce()
  })

  it('does not carry a former identity denial into the next account', () => {
    seed()
    deny(new ApiError(40300, 'Former account private context'))
    harness.principalEpoch++
    client.clear()
    seed()

    const next = renderPage()!
    expect(next.table.error).toBeNull()
    expect(next.table.rows).toEqual([row])
    expect(next.form.open).toBe(false)
  })

  it('drops the denial when its module is invalidated and later granted again', async () => {
    const scope = new ModuleScope('fixture')
    const menu = normalizeMenuNode({
      id: 'module-menu',
      parentId: '0',
      menuName: 'Fixture',
      type: 'M',
      path: 'fixture',
      component: 'fixture/index',
      moduleKey: 'fixture',
      perms: 'system:user:list',
      icon: null,
      sort: 0,
    })
    await accessLifecycle.reset(1, client)
    await accessLifecycle.accept(1, [menu], ['system:user:list'], client)
    seed(scope)
    deny(new ApiError(40300, 'Former module context'), scope)

    await accessLifecycle.accept(1, [], [], client)
    expect(renderPage(scope)).toBeNull()
    await accessLifecycle.accept(1, [menu], ['system:user:list'], client)
    seed(scope)
    const restored = renderPage(scope)!
    expect(restored.table.error).toBeNull()
    expect(restored.table.rows).toEqual([row])
  })
})
