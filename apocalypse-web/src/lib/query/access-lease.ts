import { CanceledError } from 'axios'

import type { Query, QueryClient } from '@tanstack/react-query'
import type { MenuNode } from '@/lib/api/types'

/** Local result validity only; the server remains the authorization authority. */
export interface AccessLease {
  readonly principalEpoch: number
  readonly authorizationEpoch: number
  readonly moduleKey: string
  readonly moduleEpoch: number
  readonly permissions: ReadonlyArray<readonly [string, number]>
  readonly key: string
}

export interface RequestContext {
  readonly principalEpoch: number
  readonly authorizationEpoch?: number
  readonly scoped: boolean
  readonly assertCurrent: () => void
}

export interface OperationLease {
  readonly lease: AccessLease
  readonly signal: AbortSignal
  readonly context: RequestContext
  readonly isCurrent: () => boolean
  readonly finish: () => void
}

/** No business data or module registry: only accepted authorization generations and live work. */
export class AccessLifecycle {
  private principalEpoch = 0
  private authorizationEpoch = 0
  private deadline = Number.POSITIVE_INFINITY
  private ready = false
  private revision = 0
  private modules = new Map<string, string>()
  private moduleEpochs = new Map<string, number>()
  private permissions = new Set<string>()
  private permissionEpochs = new Map<string, number>()
  private listeners = new Set<() => void>()
  private operations = new Set<{ lease: AccessLease; controller: AbortController }>()
  private assertAuthorization: ((epoch: number) => void) | undefined

  /** Installed by the auth boundary; render-time isCurrent remains side-effect free. */
  configureAuthorizationGuard(guard: (epoch: number) => void) {
    this.assertAuthorization = guard
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = () => this.revision

  private notify() {
    this.revision++
    for (const listener of this.listeners) listener()
  }

  reset(principalEpoch: number, client: QueryClient) {
    this.principalEpoch = principalEpoch
    this.authorizationEpoch++
    this.deadline = Number.POSITIVE_INFINITY
    this.ready = false
    this.modules.clear()
    this.permissions.clear()
    const cleanup = this.reconcile(client)
    this.notify()
    return cleanup
  }

  pause(client: QueryClient) {
    this.ready = false
    this.authorizationEpoch++
    // Refresh must not revive old callbacks even if /me later returns identical grants.
    for (const key of this.modules.keys()) this.bump(this.moduleEpochs, key)
    const cleanup = this.reconcile(client)
    this.notify()
    return cleanup
  }

  accept(
    principalEpoch: number,
    menus: MenuNode[],
    perms: string[],
    client: QueryClient,
    authorization?: { epoch: number; deadline: number },
  ) {
    if (principalEpoch !== this.principalEpoch) return
    if (authorization) {
      this.authorizationEpoch = authorization.epoch
      this.deadline = authorization.deadline
    }
    const nextModules = new Map<string, string[]>()
    const visit = (nodes: MenuNode[], inherited: string | null, parent: string) => {
      for (const node of nodes) {
        const key = node.moduleKey || inherited
        const path = `${parent}/${node.path ?? ''}`
        if (key && node.menuType !== 'F') {
          const entries = nextModules.get(key) ?? []
          entries.push(JSON.stringify([node.id, path, node.component, node.menuType]))
          nextModules.set(key, entries)
        }
        visit(node.children, key, path)
      }
    }
    visit(menus, null, '')
    const fingerprints = new Map(
      [...nextModules].map(([key, entries]) => [key, JSON.stringify(entries.sort())]),
    )
    for (const key of new Set([...this.modules.keys(), ...fingerprints.keys()])) {
      if (this.modules.get(key) !== fingerprints.get(key)) this.bump(this.moduleEpochs, key)
    }
    const nextPermissions = new Set(perms)
    for (const perm of new Set([...this.permissions, ...nextPermissions])) {
      if (this.permissions.has(perm) !== nextPermissions.has(perm))
        this.bump(this.permissionEpochs, perm)
    }
    this.modules = fingerprints
    this.permissions = nextPermissions
    this.ready = true
    const cleanup = this.reconcile(client)
    this.notify()
    return cleanup
  }

  private bump(epochs: Map<string, number>, key: string) {
    epochs.set(key, (epochs.get(key) ?? 0) + 1)
  }

  capture(moduleKey: string, requiredPerms: readonly string[]): AccessLease {
    const moduleEpoch = this.moduleEpochs.get(moduleKey) ?? 0
    const permissions = [...new Set(requiredPerms)]
      .sort()
      .map((perm) => [perm, this.permissionEpochs.get(perm) ?? 0] as const)
    return Object.freeze({
      principalEpoch: this.principalEpoch,
      authorizationEpoch: this.authorizationEpoch,
      moduleKey,
      moduleEpoch,
      permissions,
      key: JSON.stringify([this.principalEpoch, this.authorizationEpoch, moduleEpoch, permissions]),
    })
  }

  isCurrent = (lease: AccessLease): boolean =>
    this.ready &&
    performance.now() < this.deadline &&
    lease.principalEpoch === this.principalEpoch &&
    lease.authorizationEpoch === this.authorizationEpoch &&
    this.modules.has(lease.moduleKey) &&
    lease.moduleEpoch === (this.moduleEpochs.get(lease.moduleKey) ?? 0) &&
    lease.permissions.every(
      ([perm, epoch]) =>
        this.permissions.has(perm) && epoch === (this.permissionEpochs.get(perm) ?? 0),
    )

  subset(lease: AccessLease, requiredPerms: readonly string[]): AccessLease {
    const permissions = [...new Set(requiredPerms)].sort().map((perm) => {
      const captured = lease.permissions.find(([name]) => name === perm)
      if (!captured) throw new Error('Operation permission was not captured at dispatch')
      return captured
    })
    return Object.freeze({
      ...lease,
      permissions,
      key: JSON.stringify([
        lease.principalEpoch,
        lease.authorizationEpoch,
        lease.moduleEpoch,
        permissions,
      ]),
    })
  }

  assertCurrent(lease: AccessLease) {
    this.assertAuthorization?.(lease.authorizationEpoch)
    if (!this.isCurrent(lease)) throw new CanceledError('Authorization changed')
  }

  context(lease: AccessLease): RequestContext {
    return {
      principalEpoch: lease.principalEpoch,
      authorizationEpoch: lease.authorizationEpoch,
      scoped: true,
      assertCurrent: () => this.assertCurrent(lease),
    }
  }

  begin(lease: AccessLease): OperationLease {
    this.assertCurrent(lease)
    const operation = { lease, controller: new AbortController() }
    this.operations.add(operation)
    return {
      lease,
      signal: operation.controller.signal,
      context: this.context(lease),
      isCurrent: () => {
        if (operation.controller.signal.aborted) return false
        try {
          this.assertCurrent(lease)
          return true
        } catch {
          return false
        }
      },
      finish: () => this.operations.delete(operation),
    }
  }

  private reconcile(client: QueryClient) {
    for (const operation of this.operations) {
      if (!this.isCurrent(operation.lease)) {
        operation.controller.abort()
        this.operations.delete(operation)
      }
    }
    // Pin query objects, not a future predicate: rapid re-grant must retain new-generation data.
    const stale = new Set(
      client
        .getQueryCache()
        .getAll()
        .filter((query) => {
          const lease = query.meta?.accessLease as AccessLease | undefined
          return lease !== undefined && !this.isCurrent(lease)
        }),
    )
    if (stale.size) {
      const filter = { predicate: (query: Query) => stale.has(query) }
      return client.cancelQueries(filter).then(() => client.removeQueries(filter))
    }
    return Promise.resolve()
  }
}

export const accessLifecycle = new AccessLifecycle()
