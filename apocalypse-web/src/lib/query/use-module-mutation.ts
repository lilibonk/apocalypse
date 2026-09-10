import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CanceledError, isCancel } from 'axios'
import { useLayoutEffect, useRef } from 'react'
import { captureRequestContext } from '@/lib/api/client'

import { accessLifecycle, type AccessLease, type OperationLease } from './access-lease'
import type { ModuleOperation, ModuleScope } from './module-scope'
import { isResourceDenied, type ResourceDenialHandler } from './use-resource-denial'

export type RunModuleOperation = <Args extends unknown[], Data>(
  operation: ModuleOperation<Args, Data>,
  ...args: Args
) => Promise<Data>

interface Options<Variables, Data> {
  /** Selection/editor generation. Close/reopen or change selection invalidates old callbacks. */
  localKey: string
  mutationFn: (run: RunModuleOperation, variables: Variables) => Promise<Data>
  onSuccess?: (data: Data, variables: Variables) => void
  onError?: (error: Error, variables: Variables) => void
  onDenied?: ResourceDenialHandler
  onSettled?: (variables: Variables) => void
}

/** Capture callbacks and validity per invocation, never relabel an old result with a new lease. */
export function useModuleMutation<Variables = void, Data = unknown>(
  scope: ModuleScope | undefined,
  options: Options<Variables, Data>,
) {
  const queryClient = useQueryClient()
  const local = useRef({ key: options.localKey, active: true })
  useLayoutEffect(() => {
    const generation = { key: options.localKey, active: true }
    local.current = generation
    return () => {
      generation.active = false
    }
  }, [options.localKey])

  type Invocation = {
    variables: Variables
    options: Options<Variables, Data>
    base: Pick<OperationLease, 'signal' | 'context' | 'isCurrent' | 'finish'>
    operations: OperationLease[]
    permissions?: AccessLease
    current: () => boolean
    remove: () => void
  }
  const mutation = useMutation<Data, Error, Invocation>({
    retry: false,
    meta: scope ? { moduleKey: scope.moduleKey } : undefined,
    mutationFn: async (invocation) => {
      if (!invocation.current()) throw new CanceledError()
      const run: RunModuleOperation = async (definition, ...args) => {
        if (definition.scope !== scope || !invocation.current()) throw new CanceledError()
        const operation = invocation.permissions
          ? accessLifecycle.begin(
              accessLifecycle.subset(invocation.permissions, definition.requiredPerms),
            )
          : invocation.base
        if ('lease' in operation) invocation.operations.push(operation as OperationLease)
        operation.signal.addEventListener('abort', invocation.remove, { once: true })
        const data = await definition.execute(operation, ...args)
        if (!invocation.current()) throw new CanceledError()
        return data
      }
      const data = await invocation.options.mutationFn(run, invocation.variables)
      if (!invocation.current()) throw new CanceledError()
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
        invocation.base.signal.removeEventListener('abort', invocation.remove)
        invocation.operations.forEach((operation) =>
          operation.signal.removeEventListener('abort', invocation.remove),
        )
        invocation.base.finish()
        invocation.operations.forEach((operation) => operation.finish())
      }
    },
  })

  const mutate = (variables: Variables) => {
    const generation = local.current
    if (!generation.active || generation.key !== options.localKey) return
    const lease = scope ? accessLifecycle.capture(scope.moduleKey, []) : undefined
    if (lease && !accessLifecycle.isCurrent(lease)) return
    const base = lease ? accessLifecycle.begin(lease) : coreOperation()
    const operations: OperationLease[] = []
    const invocation: Invocation = {
      variables,
      options,
      base,
      operations,
      permissions: scope
        ? accessLifecycle.capture(scope.moduleKey, scope.requiredPerms)
        : undefined,
      current: () =>
        generation.active &&
        (options.onDenied?.isCurrent() ?? true) &&
        base.isCurrent() &&
        operations.every((op) => op.isCurrent()),
      remove: () => {
        for (const cached of queryClient.getMutationCache().getAll())
          if (cached.state.variables === invocation) queryClient.getMutationCache().remove(cached)
      },
    }
    base.signal.addEventListener('abort', invocation.remove, { once: true })
    mutation.mutate(invocation)
  }
  // No unguarded mutateAsync continuation; effects belong to the captured callbacks above.
  return { mutate, isPending: mutation.isPending }
}

function coreOperation(): Pick<OperationLease, 'signal' | 'context' | 'isCurrent' | 'finish'> {
  const context = captureRequestContext()
  return {
    signal: new AbortController().signal,
    context,
    isCurrent: () => {
      try {
        context.assertCurrent()
        return true
      } catch {
        return false
      }
    },
    finish: () => {},
  }
}
