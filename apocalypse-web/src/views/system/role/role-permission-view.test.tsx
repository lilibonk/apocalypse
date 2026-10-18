import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'

import { RolePermissionView } from './RolePermissionView'
import {
  buildRolePermissionModel,
  type RawRoleMenu,
  type RolePermissionModel,
  type RolePermissionOpening,
} from './role-permission.model'
import type { createRolePermissionQuery } from './role-permission.queries'

type ReadOptions = ReturnType<typeof createRolePermissionQuery>['options']
type Effect = { setup: () => void | (() => void); deps?: readonly unknown[] }
type ButtonProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean }
const harness = vi.hoisted(() => ({
  stateIndex: 0,
  states: [] as unknown[],
  memoIndex: 0,
  memos: [] as Array<{ value: unknown; deps: readonly unknown[] }>,
  refIndex: 0,
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Effect[],
  previousEffects: [] as Array<Effect & { cleanup?: () => void }>,
  buttons: [] as ButtonProps[],
  onResourceDenied: undefined as (() => void) | undefined,
  query: vi.fn(),
  request: vi.fn(),
  auth: {
    authorizationEpoch: 1,
    get allScopePerms() {
      return this.perms
    },
    sessionEpoch: 8,
    meLoaded: true,
    perms: ['system:role:list', 'system:menu:list', 'system:role:edit'],
  },
}))

// Keep the parent's hook lifetime between SSR passes. The child editor is a boundary
// probe; the production query factory, cache, denial handling, and view remain real.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = harness.stateIndex++
    if (!(index in harness.states))
      harness.states[index] = typeof initial === 'function' ? initial() : initial
    return [
      harness.states[index],
      (next: unknown) => {
        harness.states[index] = typeof next === 'function' ? next(harness.states[index]) : next
      },
    ]
  },
  useMemo: (create: () => unknown, deps: readonly unknown[]) => {
    const index = harness.memoIndex++
    const previous = harness.memos[index]
    if (
      !previous ||
      deps.length !== previous.deps.length ||
      deps.some((value, item) => !Object.is(value, previous.deps[item]))
    )
      harness.memos[index] = { value: create(), deps }
    return harness.memos[index]!.value
  },
  useRef: (initial: unknown) => {
    const index = harness.refIndex++
    return (harness.refs[index] ??= { current: initial })
  },
  useLayoutEffect: (setup: Effect['setup'], deps?: readonly unknown[]) =>
    harness.effects.push({ setup, deps }),
}))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: harness.query,
}))
vi.mock('@/lib/api/client', async (original) => ({
  ...(await original<typeof import('@/lib/api/client')>()),
  request: harness.request,
  captureRequestContext: () => ({ principalEpoch: 8, scoped: false, assertCurrent: () => {} }),
}))
vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    epoch === undefined || epoch === harness.auth.authorizationEpoch,
  assertAuthorizationCurrent: () => undefined,
  useAuthStore: Object.assign(() => harness.auth, {
    getState: () => harness.auth,
    subscribe: () => () => {},
  }),
}))
vi.mock('@/hooks/useDesktopViewport', () => ({ useDesktopViewport: () => true }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
    i18n: { resolvedLanguage: 'zh' },
  }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/components/insights/InsightCard', () => ({
  InsightCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/insights/AnimatedNumber', () => ({
  AnimatedNumber: ({ value }: { value: number }) => <span>{value}</span>,
}))
vi.mock('@/components/ui/button', () => ({
  Button: (props: ButtonProps) => {
    harness.buttons.push(props)
    return <button disabled={props.disabled}>{props.children}</button>
  },
}))
vi.mock('./RolePermissionGraph', () => ({
  RoleGraphPagination: () => null,
  RolePermissionGraph: ({ model }: { model: RolePermissionModel }) => (
    <div data-testid="permission-graph">{model.nodes.map((node) => node.name).join(', ')}</div>
  ),
}))
vi.mock('./RolePermissionEditor', () => ({
  RolePermissionEditor: ({ onResourceDenied }: { onResourceDenied: () => void }) => {
    harness.onResourceDenied = onResourceDenied
    return <div data-testid="permission-editor">Menu editor</div>
  },
}))

const opening: RolePermissionOpening = {
  role: {
    id: '9223372036854775801',
    roleName: '审计员',
    roleKey: 'audit',
    status: 1,
    dataScope: 'ALL',
  },
  openId: 'role-opening',
  principalEpoch: 8,
}
const oldTree: RawRoleMenu[] = [
  {
    id: '100',
    parentId: '0',
    menuName: 'sensitive-old-menu',
    type: 'M',
    perms: 'system:user:list',
    icon: null,
    component: null,
    path: null,
    sort: 0,
  },
]
const freshTree = [{ ...oldTree[0]!, id: '200', menuName: 'fresh-readable-menu' }]
const oldModel = buildRolePermissionModel(oldTree, ['100'])
let client: QueryClient
let readOptions: ReadOptions
const onEditingChange = vi.fn()

function renderView() {
  harness.stateIndex = 0
  harness.memoIndex = 0
  harness.refIndex = 0
  harness.effects = []
  harness.buttons = []
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RolePermissionView opening={opening} onEditingChange={onEditingChange} />
    </QueryClientProvider>,
  )
  harness.previousEffects = harness.effects.map((current, index) => {
    const previous = harness.previousEffects[index]
    if (
      current.deps &&
      previous?.deps &&
      current.deps.length === previous.deps.length &&
      current.deps.every((value, item) => Object.is(value, previous.deps![item]))
    )
      return previous
    previous?.cleanup?.()
    const cleanup = current.setup()
    return { ...current, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
  })
  return html
}

function openEditor() {
  renderView()
  client.setQueryData(readOptions.queryKey, oldModel)
  expect(renderView()).toContain('sensitive-old-menu')
  const oldKey = readOptions.queryKey
  harness.buttons.find(
    (button) => Array.isArray(button.children) && button.children.includes('编辑授权关系'),
  )!.onClick!()
  expect(renderView()).toContain('data-testid="permission-editor"')
  expect(onEditingChange).toHaveBeenLastCalledWith(true)
  return oldKey
}

beforeEach(() => {
  harness.states = []
  harness.memos = []
  harness.refs = []
  harness.effects = []
  harness.previousEffects = []
  harness.onResourceDenied = undefined
  harness.auth.perms = ['system:role:list', 'system:menu:list', 'system:role:edit']
  harness.request.mockReset()
  onEditingChange.mockReset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  harness.query.mockReset().mockImplementation((options: ReadOptions) => {
    readOptions = options
    const state = client.getQueryState(options.queryKey)
    return {
      data: state?.data,
      error: state?.error ?? null,
      isFetching: state?.fetchStatus === 'fetching',
      refetch: () => client.fetchQuery(options),
    }
  })
})
afterEach(() => {
  harness.previousEffects.forEach((effect) => effect.cleanup?.())
  client.clear()
})

describe('role menu editor denial boundary', () => {
  it.each([403, 404])(
    'retires the old read and hides its graph while the new read loads or returns %s',
    async (code) => {
      const oldKey = openEditor()
      harness.onResourceDenied!()
      const loading = renderView()
      expect(readOptions.queryKey).not.toEqual(oldKey)
      expect(loading).toContain('roleGraph.loading')
      expect(loading).not.toContain('sensitive-old-menu')
      expect(loading).not.toContain('data-testid="permission-graph"')
      expect(loading).not.toContain('data-testid="permission-editor"')
      expect(onEditingChange).toHaveBeenLastCalledWith(false)
      // The old cache still exists until cleanup's microtask, so hiding it depends
      // on changing the read identity rather than racing cancellation/removal.
      expect(client.getQueryData(oldKey)).toEqual(oldModel)
      await Promise.resolve()
      expect(client.getQueryData(oldKey)).toBeUndefined()

      harness.request.mockRejectedValue(new ApiError(code, '角色已不可访问'))
      await expect(client.fetchQuery(readOptions)).rejects.toThrow('角色已不可访问')
      const denied = renderView()
      expect(denied).toContain('角色已不可访问')
      expect(denied).toContain('role="alert"')
      expect(denied).not.toContain('sensitive-old-menu')
      expect(denied).not.toContain('data-testid="permission-graph"')
      expect(denied).not.toContain('data-testid="permission-editor"')
    },
  )

  it('shows only a successful fresh read while the current principal retains read access', async () => {
    const oldKey = openEditor()
    harness.onResourceDenied!()
    expect(renderView()).toContain('roleGraph.loading')
    expect(readOptions.queryKey).not.toEqual(oldKey)
    await Promise.resolve()
    harness.request.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/system/menus/tree' ? freshTree : { revision: '12', navigationIds: ['200'] },
      ),
    )
    await client.fetchQuery(readOptions)
    harness.auth.perms = ['system:role:list', 'system:menu:list']
    const readable = renderView()
    expect(readable).toContain('data-testid="permission-graph"')
    expect(readable).toContain('fresh-readable-menu')
    expect(readable).not.toContain('sensitive-old-menu')
    expect(readable).not.toContain('data-testid="permission-editor"')
    expect(
      harness.buttons.some(
        (button) => Array.isArray(button.children) && button.children.includes('编辑授权关系'),
      ),
    ).toBe(false)

    harness.auth.perms = ['system:role:list']
    const denied = renderView()
    expect(denied).not.toContain('data-testid="permission-graph"')
    expect(denied).not.toContain('fresh-readable-menu')
  })
})
