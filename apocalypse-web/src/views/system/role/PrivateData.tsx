import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useLayoutEffect, useState, type ReactNode } from 'react'

import { useAuthStore } from '@/stores/auth'

import { privateRoleGraphQuery } from './role-permission.queries'

type Loader<Data> = Parameters<typeof privateRoleGraphQuery<Data>>[3]

/**
 * Private, epoch-bound query with the same revocation lifecycle as the role graph. Callers key this
 * component by query identity, so the resource is created exactly once per identity.
 */
export function PrivateData<Data>({
  queryKey,
  load,
  canRead,
  children,
}: {
  queryKey: readonly unknown[]
  load: Loader<Data>
  canRead: Parameters<typeof privateRoleGraphQuery>[2]
  children: (query: UseQueryResult<Data>) => ReactNode
}) {
  const client = useQueryClient()
  const [resource] = useState(() =>
    privateRoleGraphQuery(queryKey, useAuthStore.getState().sessionEpoch, canRead, load),
  )
  useLayoutEffect(() => {
    resource.activate()
    return () => {
      resource.deactivate()
      queueMicrotask(() => {
        if (!resource.disposeIfInactive()) return
        void client.cancelQueries(resource.filter, { revert: false })
        client.removeQueries(resource.filter)
      })
    }
  }, [client, resource])
  return <>{children(useQuery(resource.options))}</>
}
