import { useQueryClient, type QueryFilters } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ApiError } from '@/lib/api/client'

export function isResourceDenied(error: unknown): error is ApiError {
  return error instanceof ApiError && [403, 40300, 404, 40400].includes(error.code)
}

export interface ResourceDenialHandler {
  handle: (error: Error) => void
  isCurrent: () => boolean
}

/** Object ownership can change without /me changing. Never infer a new grant from a denial. */
export function useResourceDenial(options: {
  errors: readonly unknown[]
  clear: QueryFilters
  refresh?: QueryFilters
  reset: () => void
}) {
  const client = useQueryClient()
  const handled = useRef(new WeakSet<Error>())
  const generation = useRef(0)
  const [capturedGeneration, setCapturedGeneration] = useState(0)
  const deny = (error: Error) => {
    if (!isResourceDenied(error) || handled.current.has(error)) return
    handled.current.add(error)
    generation.current++
    setCapturedGeneration(generation.current)
    options.reset()
    // Snapshot objects before cancellation. Do not clear a newly selected/refetched generation.
    const affected = new Set(client.getQueryCache().findAll(options.clear))
    const filter = {
      predicate: (query: Parameters<NonNullable<QueryFilters['predicate']>>[0]) =>
        affected.has(query),
    }
    // revert:false prevents cancellation from restoring the sensitive previous value.
    void client.cancelQueries(filter, { revert: false })
    for (const query of affected)
      query.setState({ data: undefined, dataUpdatedAt: 0, isInvalidated: true })
    if (options.refresh) {
      const refreshable = new Set(
        client
          .getQueryCache()
          .findAll(options.refresh)
          .filter((query) => !isResourceDenied(query.state.error)),
      )
      // A denied context must wait for explicit retry, not enter a 403/refetch loop.
      void client.invalidateQueries({ predicate: (query) => refreshable.has(query) })
    }
    toast.error(error.message)
  }
  useLayoutEffect(() => {
    for (const error of options.errors) if (isResourceDenied(error)) deny(error)
  })
  return { handle: deny, isCurrent: () => generation.current === capturedGeneration }
}
