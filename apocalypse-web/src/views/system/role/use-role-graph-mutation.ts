import { useLayoutEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CanceledError, isCancel } from 'axios'

import { isResourceDenied, type ResourceDenialHandler } from '@/lib/query/use-resource-denial'

import { captureRoleGraphOperation, type RoleGraphTransport } from './role-graph.operations'

export interface RoleGraphMutationOptions<Variables, Data> {
  requiredPerms: readonly string[]
  requiredAllScopePerms?: readonly string[]
  /** Workspace + selected role + editor opening. Changing it invalidates old effects. */
  localKey: string
  mutationFn: (variables: Variables, transport: RoleGraphTransport) => Promise<Data>
  onSuccess?: (data: Data, variables: Variables) => void
  onError?: (error: Error, variables: Variables) => void
  onSettled?: (variables: Variables) => void
  onDenied?: ResourceDenialHandler
}

/** Core role writes keep captured callbacks and permission lifetime without a ModuleScope. */
export function useRoleGraphMutation<Variables = void, Data = unknown>(
  options: RoleGraphMutationOptions<Variables, Data>,
) {
  const client = useQueryClient()
  const permissionKey = JSON.stringify([
    [...new Set(options.requiredPerms)].sort(),
    [...new Set(options.requiredAllScopePerms ?? [])].sort(),
  ])
  type LocalGeneration = {
    key: string
    permissionKey: string
    active: boolean
    cancel: Set<() => void>
  }
  const local = useRef<LocalGeneration>({
    key: options.localKey,
    permissionKey,
    active: true,
    cancel: new Set(),
  })
  useLayoutEffect(() => {
    const generation: LocalGeneration = {
      key: options.localKey,
      permissionKey,
      active: true,
      cancel: new Set(),
    }
    local.current = generation
    return () => {
      generation.active = false
      generation.cancel.forEach((cancel) => cancel())
      generation.cancel.clear()
    }
  }, [options.localKey, permissionKey])

  type Invocation = {
    variables: Variables
    options: RoleGraphMutationOptions<Variables, Data>
    operation: ReturnType<typeof captureRoleGraphOperation>
    current: () => boolean
    finish: () => void
  }
  const mutation = useMutation<Data, Error, Invocation>({
    retry: false,
    mutationFn: async (invocation) => {
      invocation.operation.transport.assertCurrent()
      const data = await invocation.options.mutationFn(
        invocation.variables,
        invocation.operation.transport,
      )
      invocation.operation.transport.assertCurrent()
      return data
    },
    onSuccess: (data, invocation) => {
      if (invocation.current()) invocation.options.onSuccess?.(data, invocation.variables)
    },
    onError: (error, invocation) => {
      if (!invocation.current() || isCancel(error)) return
      if (isResourceDenied(error) && invocation.options.onDenied)
        invocation.options.onDenied.handle(error)
      else invocation.options.onError?.(error, invocation.variables)
    },
    onSettled: (_data, _error, invocation) => {
      try {
        if (invocation.current()) invocation.options.onSettled?.(invocation.variables)
      } finally {
        invocation.finish()
      }
    },
  })

  const mutate = (variables: Variables) => {
    const generation = local.current
    if (
      !generation.active ||
      generation.key !== options.localKey ||
      generation.permissionKey !== permissionKey ||
      generation.cancel.size > 0
    )
      return
    let operation: ReturnType<typeof captureRoleGraphOperation>
    try {
      operation = captureRoleGraphOperation(
        options.requiredPerms,
        () => generation.active && (options.onDenied?.isCurrent() ?? true),
        options.requiredAllScopePerms,
      )
    } catch (error) {
      if (error instanceof CanceledError || isCancel(error)) return
      throw error
    }
    const remove = () => {
      for (const cached of client.getMutationCache().getAll())
        if (cached.state.variables === invocation) client.getMutationCache().remove(cached)
    }
    const cancel = () => {
      operation.cancel()
      remove()
    }
    const invocation: Invocation = {
      variables,
      options,
      operation,
      current: operation.isCurrent,
      finish: () => {
        generation.cancel.delete(cancel)
        operation.transport.signal.removeEventListener('abort', remove)
        operation.finish()
      },
    }
    generation.cancel.add(cancel)
    operation.transport.signal.addEventListener('abort', remove, { once: true })
    mutation.mutate(invocation)
  }

  // No mutateAsync: continuations belong to the captured, permission-checked callbacks above.
  return { mutate, isPending: mutation.isPending }
}
