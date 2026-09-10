import { queryOptions, type Query, type QueryClient } from '@tanstack/react-query'

import { accessLifecycle, type AccessLease, type RequestContext } from './access-lease'

export interface ScopedRequest {
  signal: AbortSignal
  context: RequestContext
}

export interface ModuleOperation<Args extends unknown[], Data> {
  readonly scope: ModuleScope | undefined
  readonly requiredPerms: readonly string[]
  readonly execute: (request: ScopedRequest, ...args: Args) => Promise<Data>
}

type Params = Record<string, unknown>

/** Owns definitions, not cached data. Native Query options work for hooks, fetch and prefetch. */
export class ModuleScope {
  private usedPermissions = new Set<string>()
  readonly moduleKey: string

  constructor(moduleKey: string) {
    if (!/^[a-z][a-z0-9-]*$/.test(moduleKey)) throw new Error('Invalid module key')
    this.moduleKey = moduleKey
  }

  get requiredPerms(): readonly string[] {
    return [...this.usedPermissions].sort()
  }

  private declare(perms: readonly string[]) {
    for (const perm of perms) this.usedPermissions.add(perm)
  }

  query<P extends Params, Data>(
    resource: string,
    requiredPerms: readonly string[],
    fetch: (params: P, request: ScopedRequest) => Promise<Data>,
  ) {
    this.declare(requiredPerms)
    const options = (params: P, enabled = true) => {
      const lease = accessLifecycle.capture(this.moduleKey, requiredPerms)
      return queryOptions<Data, Error, Data, readonly unknown[]>({
        queryKey: ['module', this.moduleKey, lease.key, resource, params] as const,
        meta: { moduleKey: this.moduleKey, resource, params, requiredPerms, accessLease: lease },
        enabled: enabled && accessLifecycle.isCurrent(lease),
        queryFn: async ({ signal }) => {
          accessLifecycle.assertCurrent(lease)
          const data = await fetch(params, { signal, context: accessLifecycle.context(lease) })
          accessLifecycle.assertCurrent(lease)
          return data
        },
      })
    }
    return Object.assign(options, {
      filter: (params: Partial<P> = {}) => ({
        predicate: (query: Query) =>
          this.ownsCurrent(query) &&
          query.meta?.resource === resource &&
          Object.entries(params).every(
            ([key, value]) => (query.meta?.params as Params | undefined)?.[key] === value,
          ),
      }),
      setData: (client: QueryClient, lease: AccessLease, params: P, data: Data) => {
        accessLifecycle.assertCurrent(lease)
        if (lease.moduleKey !== this.moduleKey) throw new Error('Wrong scope')
        const current = options(params)
        if (current.queryKey[2] !== lease.key) throw new Error('Wrong query lease')
        client.setQueryData(current.queryKey, data)
      },
    })
  }

  operation<Args extends unknown[], Data>(
    requiredPerms: readonly string[],
    execute: (request: ScopedRequest, ...args: Args) => Promise<Data>,
  ): ModuleOperation<Args, Data> {
    this.declare(requiredPerms)
    return Object.freeze({ scope: this, requiredPerms, execute })
  }

  private ownsCurrent(query: Query) {
    const lease = query.meta?.accessLease as AccessLease | undefined
    return query.meta?.moduleKey === this.moduleKey && !!lease && accessLifecycle.isCurrent(lease)
  }

  /** Derived ownership filter; callers supply resource identity, never repeat moduleKey. */
  filter(params: Params = {}) {
    return {
      predicate: (query: Query) =>
        this.ownsCurrent(query) &&
        Object.entries(params).every(
          ([key, value]) => (query.meta?.params as Params | undefined)?.[key] === value,
        ),
    }
  }
}
