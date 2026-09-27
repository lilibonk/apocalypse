import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'
import { useResourceDenial } from '@/lib/query/use-resource-denial'

import { createDynaQueries } from '../dyna-queries'
import { DynaPage } from '../DynaPage'
import type { DynaPageSchema } from '../schema'

const { effects, toastError } = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  toastError: vi.fn(),
}))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useLayoutEffect: (effect: () => void) => effects.push(effect),
}))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const schema: DynaPageSchema = {
  key: 'users',
  endpoint: '/system/users',
  title: 'Users',
  columns: [{ key: 'username', title: 'Username' }],
}
const queries = createDynaQueries(schema)
const list = (page: number) =>
  queries.list(
    { schemaKey: schema.key, endpoint: schema.endpoint, page, size: 10, search: {} },
    true,
  )

let client: QueryClient
beforeEach(() => {
  effects.length = 0
  toastError.mockReset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => client.clear())

describe('Dyna denial boundaries', () => {
  it('connects a core DynaPage denial to its own schema cache without requiring a module scope', () => {
    const key = list(1).queryKey
    client.setQueryData(key, {
      list: [{ id: '1', username: 'private-account' }],
      page: 1,
      size: 10,
      total: 1,
    })
    client
      .getQueryCache()
      .find({ queryKey: key })
      ?.setState({ error: new ApiError(40300, 'access withdrawn'), status: 'error' })
    client.setQueryData(['auth', 'me'], 'current-identity')

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <DynaPage schema={schema} />
      </QueryClientProvider>,
    )
    expect(html).toContain('access withdrawn')
    expect(html).not.toContain('private-account')
    for (const effect of effects) effect()
    expect(client.getQueryData(key)).toBeUndefined()
    expect(client.getQueryData(['auth', 'me'])).toBe('current-identity')
  })

  it('clears only the denied schema, closes its editing context, and does not refetch in a loop', async () => {
    const denied = new ApiError(40300, '访问已撤回')
    const first = list(1)
    const second = list(2)
    const unrelatedKey = ['dyna', '/system/roles', 'roles', 1, 10, {}]
    const coreKey = ['auth', 'me']
    const otherModuleKey = ['modules', 'calendar', 'month']
    const pageData = { list: [{ id: '1', username: 'Private' }], page: 1, size: 10, total: 15 }
    client.setQueryData(first.queryKey, pageData)
    client.setQueryData(second.queryKey, pageData)
    client.setQueryData(unrelatedKey, 'other-schema')
    client.setQueryData(coreKey, 'current-identity')
    client.setQueryData(otherModuleKey, 'other-module')
    client
      .getQueryCache()
      .find({ queryKey: first.queryKey })
      ?.setState({ error: denied, status: 'error' })
    const reset = vi.fn()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    function Probe() {
      useResourceDenial({ errors: [denied], clear: queries.filter(), reset })
      return null
    }
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )
    for (const effect of effects) effect()
    await Promise.resolve()

    expect(client.getQueryData(first.queryKey)).toBeUndefined()
    expect(client.getQueryData(second.queryKey)).toBeUndefined()
    expect(client.getQueryData(unrelatedKey)).toBe('other-schema')
    expect(client.getQueryData(coreKey)).toBe('current-identity')
    expect(client.getQueryData(otherModuleKey)).toBe('other-module')
    expect(reset).toHaveBeenCalledOnce()
    expect(invalidate).not.toHaveBeenCalled()

    for (const effect of effects) effect()
    expect(reset).toHaveBeenCalledOnce()
    expect(toastError).toHaveBeenCalledOnce()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('preserves the successful page and editing context on a transient refresh failure', () => {
    const key = list(1).queryKey
    const data = { list: [{ id: '1', username: 'Visible' }], page: 1, size: 10, total: 1 }
    client.setQueryData(key, data)
    const reset = vi.fn()
    function Probe() {
      useResourceDenial({
        errors: [new ApiError(50000, '服务暂时不可用')],
        clear: queries.filter(),
        reset,
      })
      return null
    }
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )
    for (const effect of effects) effect()
    expect(client.getQueryData(key)).toEqual(data)
    expect(reset).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })
})
