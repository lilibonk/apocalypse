import { beforeEach, describe, expect, it } from 'vitest'

import { RECENT_ROUTE_LIMIT, useRecentRoutes } from './recent-routes'

describe('recent routes', () => {
  beforeEach(() => useRecentRoutes.setState({ owner: null, paths: [] }))

  it('keeps the newest unique paths for one owner within the limit', () => {
    const store = useRecentRoutes.getState()
    for (let index = 0; index < RECENT_ROUTE_LIMIT + 2; index++) store.record('u1', `/p/${index}`)
    store.record('u1', '/p/3/')
    const paths = useRecentRoutes.getState().forOwner('u1')
    expect(paths).toHaveLength(RECENT_ROUTE_LIMIT)
    expect(paths[0]).toBe('/p/3')
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('never shows another account its predecessor’s history', () => {
    useRecentRoutes.getState().record('u1', '/system/role')
    expect(useRecentRoutes.getState().forOwner('u2')).toEqual([])
    useRecentRoutes.getState().record('u2', '/system/dict')
    expect(useRecentRoutes.getState().forOwner('u1')).toEqual([])
    expect(useRecentRoutes.getState().forOwner('u2')).toEqual(['/system/dict'])
    expect(useRecentRoutes.getState().forOwner(null)).toEqual([])
  })

  it('returns the same empty list for a non-owner so selectors stay stable', () => {
    const store = useRecentRoutes.getState()
    expect(store.forOwner('u1')).toBe(store.forOwner('u1'))
    expect(store.forOwner(null)).toBe(store.forOwner(undefined))
  })
})
