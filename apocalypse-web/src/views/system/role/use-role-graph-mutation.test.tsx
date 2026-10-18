import { createElement, useLayoutEffect } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, type MutationOptions } from '@tanstack/react-query'
import { CanceledError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'

import { useRoleGraphMutation, type RoleGraphMutationOptions } from './use-role-graph-mutation'

const harness = vi.hoisted(() => ({
  auth: {
    authorizationEpoch: 1,
    get allScopePerms() {
      return this.perms
    },
    sessionEpoch: 8,
    meLoaded: true,
    perms: ['system:role:edit'],
  },
  listeners: new Set<() => void>(),
  effects: [] as Array<() => void | (() => void)>,
  client: undefined as QueryClient | undefined,
  executions: [] as Promise<unknown>[],
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useLayoutEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
}))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => harness.client,
  // Execute actual TanStack Mutation objects, while the server-rendered probe controls cleanup.
  useMutation: (options: MutationOptions<unknown, Error, unknown>) => ({
    isPending: false,
    variables: undefined,
    mutate: (variables: unknown) => {
      const cache = harness.client!
      const mutation = cache.getMutationCache().build(cache, options)
      const execution = mutation.execute(variables)
      harness.executions.push(execution)
      void execution.catch(() => {})
    },
  }),
}))
vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    epoch === undefined || epoch === harness.auth.authorizationEpoch,
  assertAuthorizationCurrent: () => undefined,
  useAuthStore: {
    getState: () => harness.auth,
    subscribe: (listener: () => void) => {
      harness.listeners.add(listener)
      return () => harness.listeners.delete(listener)
    },
  },
}))
vi.mock('@/lib/api/client', async (original) => ({
  ...(await original<typeof import('@/lib/api/client')>()),
  captureRequestContext: () => {
    const principalEpoch = harness.auth.sessionEpoch
    return {
      principalEpoch,
      scoped: false,
      assertCurrent: () => {
        if (harness.auth.sessionEpoch !== principalEpoch)
          throw new CanceledError('Identity changed')
      },
    }
  },
}))

function deferred<Data>() {
  let resolve!: (data: Data) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Data>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function renderMutation(options: RoleGraphMutationOptions<string, string>) {
  let api!: ReturnType<typeof useRoleGraphMutation<string, string>>
  const firstEffect = harness.effects.length
  function Probe() {
    const current = useRoleGraphMutation(options)
    useLayoutEffect(() => {
      api = current
    }, [current])
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  const effects = harness.effects.slice(firstEffect)
  const setup = () => {
    const cleanups = effects.map((effect) => effect())
    return () =>
      cleanups.forEach((cleanup) => {
        if (typeof cleanup === 'function') cleanup()
      })
  }
  const cleanup = setup()
  return { api, cleanup, setup }
}

beforeEach(() => {
  harness.auth.sessionEpoch = 8
  harness.auth.meLoaded = true
  harness.auth.perms = ['system:role:edit']
  harness.listeners.clear()
  harness.effects.length = 0
  harness.executions.length = 0
  harness.client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
})

describe('role graph captured mutation callbacks', () => {
  it('captures one invocation and synchronously ignores double submission', async () => {
    const pending = deferred<string>()
    const mutationFn = vi.fn(() => pending.promise)
    const onSuccess = vi.fn()
    const onSettled = vi.fn()
    const { api, cleanup } = renderMutation({
      requiredPerms: ['system:role:edit'],
      localKey: 'editor-A',
      mutationFn,
      onSuccess,
      onSettled,
    })
    api.mutate('original')
    api.mutate('second-click')
    expect(harness.executions).toHaveLength(1)
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    pending.resolve('saved')
    await harness.executions[0]
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith('saved', 'original')
    expect(onSettled).toHaveBeenCalledExactlyOnceWith('original')
    expect(harness.listeners.size).toBe(0)
    cleanup()
    harness.client!.clear()
  })

  it.each(['permission', 'identity', 'refresh', 'close'] as const)(
    'suppresses all stale callbacks and clears mutation ownership after %s changes',
    async (change) => {
      const pending = deferred<string>()
      const mutationFn = vi.fn(() => pending.promise)
      const onSuccess = vi.fn()
      const onError = vi.fn()
      const onSettled = vi.fn()
      const { api, cleanup } = renderMutation({
        requiredPerms: ['system:role:edit'],
        localKey: 'editor-A',
        mutationFn,
        onSuccess,
        onError,
        onSettled,
      })
      api.mutate('old draft')
      await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
      if (change === 'permission') harness.auth.perms = []
      else if (change === 'identity') harness.auth.sessionEpoch++
      else if (change === 'refresh') harness.auth.meLoaded = false
      else cleanup()
      harness.listeners.forEach((listener) => listener())
      harness.auth.perms = ['system:role:edit']
      harness.auth.meLoaded = true
      pending.resolve('late result')
      await expect(harness.executions[0]).rejects.toBeInstanceOf(CanceledError)
      expect(onSuccess).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      expect(onSettled).not.toHaveBeenCalled()
      expect(harness.client!.getMutationCache().getAll()).toHaveLength(0)
      expect(harness.listeners.size).toBe(0)
      cleanup()
      harness.client!.clear()
    },
  )

  it('delivers a current object denial to the denial handler and never treats it as success', async () => {
    const denied = new ApiError(40300, '该操作需要由全部数据范围角色授予')
    let current = true
    const handle = vi.fn(() => {
      current = false
    })
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const onSettled = vi.fn()
    const { api, cleanup } = renderMutation({
      requiredPerms: ['system:role:edit'],
      localKey: 'editor-A',
      mutationFn: () => Promise.reject(denied),
      onSuccess,
      onError,
      onSettled,
      onDenied: { isCurrent: () => current, handle },
    })
    api.mutate('draft')
    await expect(harness.executions[0]).rejects.toBe(denied)
    expect(handle).toHaveBeenCalledExactlyOnceWith(denied)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
    expect(harness.listeners.size).toBe(0)
    cleanup()
    harness.client!.clear()
  })

  it('does not reuse an older invocation callback after a different editor mounts', async () => {
    const pending = deferred<string>()
    const oldSuccess = vi.fn()
    const nextSuccess = vi.fn()
    const mutationFn = vi.fn(() => pending.promise)
    const old = renderMutation({
      requiredPerms: ['system:role:edit'],
      localKey: 'editor-A',
      mutationFn,
      onSuccess: oldSuccess,
    })
    old.api.mutate('old draft')
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    old.cleanup()
    const next = renderMutation({
      requiredPerms: ['system:role:edit'],
      localKey: 'editor-B',
      mutationFn: () => Promise.resolve('new saved'),
      onSuccess: nextSuccess,
    })
    next.api.mutate('new draft')
    await harness.executions[1]
    pending.resolve('late old saved')
    await expect(harness.executions[0]).rejects.toBeInstanceOf(CanceledError)
    expect(oldSuccess).not.toHaveBeenCalled()
    expect(nextSuccess).toHaveBeenCalledExactlyOnceWith('new saved', 'new draft')
    next.cleanup()
    harness.client!.clear()
  })

  it('allows a new invocation after StrictMode setup-cleanup-setup with no dispatched work', async () => {
    const onSuccess = vi.fn()
    const rendered = renderMutation({
      requiredPerms: ['system:role:edit'],
      localKey: 'editor-A',
      mutationFn: () => Promise.resolve('saved'),
      onSuccess,
    })
    rendered.cleanup()
    const finalCleanup = rendered.setup()
    rendered.api.mutate('draft')
    await harness.executions[0]
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith('saved', 'draft')
    if (typeof finalCleanup === 'function') finalCleanup()
    harness.client!.clear()
  })
})
