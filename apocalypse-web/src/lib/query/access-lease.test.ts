import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import type { MenuNode } from '@/lib/api/types'
import { AccessLifecycle } from './access-lease'

const menu = (moduleKey: string): MenuNode => ({
  id: moduleKey,
  parentId: '0',
  menuName: moduleKey,
  menuType: 'M',
  path: `/${moduleKey}`,
  component: `${moduleKey}/index`,
  perms: null,
  icon: null,
  moduleKey,
  sort: 0,
  children: [],
})

describe('authorization result generations', () => {
  it('partial permission withdrawal aborts only related work and cannot revive after re-grant', async () => {
    const client = new QueryClient()
    const lifecycle = new AccessLifecycle()
    const menus = [menu('calendar'), menu('fixture')]
    lifecycle.accept(0, menus, ['read', 'write', 'fixture-read'], client)
    const read = lifecycle.capture('calendar', ['read'])
    const write = lifecycle.capture('calendar', ['write'])
    const other = lifecycle.capture('fixture', ['fixture-read'])
    const writing = lifecycle.begin(write)
    const reading = lifecycle.begin(read)
    const otherWork = lifecycle.begin(other)
    const options = (lease: typeof read) => ({
      queryKey: ['module', lease.moduleKey, lease.key],
      meta: { accessLease: lease },
    })
    for (const lease of [read, write, other])
      client.getQueryCache().build(client, options(lease)).setData('old')
    client.setQueryData(['dictionary'], 'core')

    const withdrawal = lifecycle.accept(0, menus, ['read', 'fixture-read'], client)
    expect(writing.signal.aborted).toBe(true)
    expect(reading.signal.aborted).toBe(false)
    expect(otherWork.signal.aborted).toBe(false)
    lifecycle.accept(0, menus, ['read', 'write', 'fixture-read'], client)
    const newWrite = lifecycle.capture('calendar', ['write'])
    client.getQueryCache().build(client, options(newWrite)).setData('new')
    await withdrawal

    expect(writing.isCurrent()).toBe(false)
    expect(lifecycle.isCurrent(newWrite)).toBe(true)
    expect(client.getQueryData(options(write).queryKey)).toBeUndefined()
    expect(client.getQueryData(options(newWrite).queryKey)).toBe('new')
    expect(client.getQueryData(options(read).queryKey)).toBe('old')
    expect(client.getQueryData(options(other).queryKey)).toBe('old')
    expect(client.getQueryData(['dictionary'])).toBe('core')
    reading.finish()
    otherWork.finish()
    client.clear()
  })

  it('module removal and refresh invalidate old operations even if grants return unchanged', () => {
    const client = new QueryClient()
    const lifecycle = new AccessLifecycle()
    lifecycle.accept(0, [menu('calendar')], ['read'], client)
    const original = lifecycle.begin(lifecycle.capture('calendar', ['read']))
    lifecycle.pause(client)
    expect(original.signal.aborted).toBe(true)
    lifecycle.accept(0, [menu('calendar')], ['read'], client)
    expect(original.isCurrent()).toBe(false)
    const next = lifecycle.begin(lifecycle.capture('calendar', ['read']))
    lifecycle.accept(0, [], ['read'], client)
    expect(next.signal.aborted).toBe(true)
    expect(() => lifecycle.begin(lifecycle.capture('unknown', []))).toThrow()
    client.clear()
  })

  it('late ignored-signal result cannot execute external side effects in another identity', async () => {
    const client = new QueryClient()
    const lifecycle = new AccessLifecycle()
    lifecycle.accept(0, [menu('fixture')], ['download'], client)
    const operation = lifecycle.begin(lifecycle.capture('fixture', ['download']))
    let resolve!: (value: string) => void
    const ignoredSignal = new Promise<string>((done) => {
      resolve = done
    })
    let saved = ''
    const pending = ignoredSignal.then((data) => {
      if (operation.isCurrent()) saved = data
    })
    lifecycle.reset(1, client)
    lifecycle.accept(1, [menu('fixture')], ['download'], client)
    resolve('old secret')
    await pending
    expect(saved).toBe('')
    expect(operation.signal.aborted).toBe(true)
    client.clear()
  })
})
