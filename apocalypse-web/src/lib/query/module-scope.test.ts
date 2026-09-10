import { QueryClient, isCancelledError } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDynaQueries } from '@/components/dyna/dyna-queries'
import { normalizeMenuNode } from '@/lib/api/types'
import { calendarQueries, calendarScope } from '@/views/calendar/calendar.queries'
import { accessLifecycle } from './access-lease'
import { ModuleScope } from './module-scope'

const fixtureScope = new ModuleScope('fixture')
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
let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })
  accessLifecycle.reset(0, client)
  accessLifecycle.accept(0, menus, [...calendarScope.requiredPerms, 'fixture:list'], client)
})
afterEach(() => client.clear())

describe('single query ownership', () => {
  it('Calendar response inputs have distinct keys, including omitted former pagination/personal flags', () => {
    const key = calendarQueries.day({
      calendarId: '1',
      date: '2026-01-01',
      includePersonal: true,
    }).queryKey
    expect(key).not.toEqual(
      calendarQueries.day({ calendarId: '1', date: '2026-01-01', includePersonal: false }).queryKey,
    )
    expect(calendarQueries.dataImports({ page: 1, size: 50 }).queryKey).not.toEqual(
      calendarQueries.dataImports({ page: 1, size: 100 }).queryKey,
    )
    expect(calendarQueries.members({ calendarId: '1', page: 1, size: 50 }).queryKey).not.toEqual(
      calendarQueries.members({ calendarId: '1', page: 2, size: 50 }).queryKey,
    )
    expect(
      calendarQueries.days({
        calendarId: '1',
        from: '2026-01-01',
        to: '2026-01-02',
        includePersonal: true,
      }).meta?.moduleKey,
    ).toBe(calendarScope.moduleKey)
  })

  it('native prefetch and fetch share options, inference and resource filters', async () => {
    const fetch = vi.fn(async ({ id }: { id: string }) => ({ id, name: 'Fixture' }))
    const resource = fixtureScope.query('record', ['fixture:list'], fetch)
    const options = resource({ id: '1' })
    await client.prefetchQuery(options)
    const value = await client.fetchQuery(resource({ id: '1' }))
    expect(value.name).toBe('Fixture')
    expect(fetch).toHaveBeenCalledOnce()
    const query = client.getQueryCache().find({ queryKey: options.queryKey })!
    expect(resource.filter({ id: '1' }).predicate(query)).toBe(true)
    expect(resource.filter({ id: '2' }).predicate(query)).toBe(false)
    const captured = accessLifecycle.capture('fixture', ['fixture:list'])
    resource.setData(client, captured, { id: '1' }, { id: '1', name: 'Updated' })
    expect(client.getQueryData(options.queryKey)?.name).toBe('Updated')
    await accessLifecycle.accept(0, [], [], client)
    accessLifecycle.accept(0, menus, ['fixture:list'], client)
    expect(() =>
      resource.setData(client, captured, { id: '1' }, { id: '1', name: 'Old' }),
    ).toThrow()
    expect(client.getQueryData(options.queryKey)).toBeUndefined()
  })

  it('a network implementation ignoring signal cannot refill a canceled old-generation query', async () => {
    let resolve!: (data: string) => void
    let started!: () => void
    let signal!: AbortSignal
    const running = new Promise<void>((done) => {
      started = done
    })
    const resource = fixtureScope.query(
      'slow',
      ['fixture:list'],
      (_params: { id: string }, transport) => {
        signal = transport.signal
        started()
        return new Promise<string>((done) => {
          resolve = done
        })
      },
    )
    const old = resource({ id: '1' })
    const result = client.fetchQuery(old).catch((error: unknown) => error)
    await running
    await accessLifecycle.accept(0, [menus[0]!], [...calendarScope.requiredPerms], client)
    expect(signal.aborted).toBe(true)
    resolve('old secret')
    expect(isCancelledError(await result)).toBe(true)
    expect(client.getQueryData(old.queryKey)).toBeUndefined()
  })

  it('Dyna consumes the same scope with every list input and leaves core dictionaries alone', async () => {
    const schema = {
      key: 'fixture-list',
      endpoint: '/fixture/records',
      title: 'Fixture',
      listPerm: 'fixture:list',
      columns: [{ key: 'id', title: 'ID' }],
    }
    const queries = createDynaQueries(schema, fixtureScope)
    const params = {
      schemaKey: schema.key,
      endpoint: schema.endpoint,
      page: 1,
      size: 10,
      search: { name: 'A' },
    }
    const original = queries.list(params, true)
    for (const change of [
      { size: 20 },
      { page: 2 },
      { endpoint: '/fixture/other' },
      { schemaKey: 'other' },
      { search: { name: 'B' } },
    ])
      expect(queries.list({ ...params, ...change }, true).queryKey).not.toEqual(original.queryKey)
    client
      .getQueryCache()
      .build(client, { queryKey: original.queryKey, meta: original.meta })
      .setData({ list: [{ id: 'old' }], total: 1, page: 1, size: 10 })
    client.setQueryData(['dictionary', 'common'], 'shared')
    await accessLifecycle.accept(0, [menus[0]!], [...calendarScope.requiredPerms], client)
    expect(client.getQueryData(original.queryKey)).toBeUndefined()
    expect(client.getQueryData(['dictionary', 'common'])).toBe('shared')
    const core = createDynaQueries({ ...schema, listPerm: undefined }).list(params, true)
    expect(core.meta).toBeUndefined()
    expect(core.queryKey[0]).toBe('dyna')
    expect(() => createDynaQueries({ ...schema, listPerm: undefined }, fixtureScope)).toThrow(
      'listPerm',
    )
  })
})
