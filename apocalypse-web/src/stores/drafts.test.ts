import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from './auth'
import { totalDraftCount, useDraftStore } from './drafts'

function signIn(id: string, authorizationEpoch = 1) {
  useAuthStore.setState({
    user: { id, username: id, nickname: id } as never,
    authorizationEpoch,
  })
}

describe('draft store', () => {
  beforeEach(() => {
    useDraftStore.setState({ entries: {} })
    signIn('u1')
  })

  it('tracks counts per route and removes a scope when its count reaches zero', () => {
    const store = useDraftStore.getState()
    store.put('/system/config/', 'values', 2, { a: 1 })
    store.put('/system/config', 'other', 1, {})
    expect(useDraftStore.getState().countFor('/system/config')).toBe(3)
    store.put('/system/config', 'values', 0, {})
    expect(useDraftStore.getState().countFor('/system/config')).toBe(1)
    expect(totalDraftCount()).toBe(1)
  })

  it('clears only the requested routes when tabs close', () => {
    const store = useDraftStore.getState()
    store.put('/system/config', 'values', 1, {})
    store.put('/system/dict', 'card', 1, {})
    store.clearRoutes(['/system/config'])
    expect(useDraftStore.getState().countFor('/system/config')).toBe(0)
    expect(useDraftStore.getState().countFor('/system/dict')).toBe(1)
  })

  it('drops drafts on identity or authorization changes but keeps them for the same snapshot', () => {
    useDraftStore.getState().put('/system/config', 'values', 1, { value: 'x' })
    useAuthStore.setState({ perms: [] })
    expect(totalDraftCount()).toBe(1)
    signIn('u1', 2)
    expect(totalDraftCount()).toBe(0)
    useDraftStore.getState().put('/system/config', 'values', 1, {})
    signIn('u2', 2)
    expect(totalDraftCount()).toBe(0)
  })
})
