import { queryOptions } from '@tanstack/react-query'

import { request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import type { ModuleOperation, ModuleScope, ScopedRequest } from '@/lib/query/module-scope'
import type { DynaPageSchema, DynaStatusToggleAction } from './schema'

type Row = Record<string, unknown>
export type DynaListParams = {
  schemaKey: string
  endpoint: string
  page: number
  size: number
  search: Record<string, string>
}

/** Schema owns permissions/endpoints; the runtime scope owns module identity. */
export function createDynaQueries(schema: DynaPageSchema, scope?: ModuleScope) {
  if (scope && !schema.listPerm) throw new Error('Scoped DynaPage requires schema.listPerm')
  const listRequest = (params: DynaListParams, transport: Partial<ScopedRequest>) => {
    const query: Record<string, string | number | undefined> = {
      page: params.page,
      size: params.size,
    }
    for (const [key, value] of Object.entries(params.search)) query[key] = value || undefined
    return request<PageResult<Row>>(`${params.endpoint}/page`, { query, ...transport })
  }
  const scopedList = scope?.query('dyna-list', [schema.listPerm!], listRequest)
  const operation = <Args extends unknown[], Data>(
    perm: string | undefined,
    execute: (transport: ScopedRequest, ...args: Args) => Promise<Data>,
  ): ModuleOperation<Args, Data> => {
    const requiredPerms = perm ? [perm] : []
    return scope?.operation(requiredPerms, execute) ?? { scope, requiredPerms, execute }
  }
  const update = (transport: ScopedRequest, input: { id: string; body: Row }) =>
    request<Row>(`${schema.endpoint}/${input.id}`, {
      method: 'PUT',
      body: input.body,
      ...transport,
    })
  const toggles = new Map(
    (schema.rowActions ?? [])
      .filter((action): action is DynaStatusToggleAction => action.kind === 'status-toggle')
      .map((action) => [action, operation(action.perm, update)]),
  )
  return {
    list: (params: DynaListParams, enabled: boolean) =>
      scopedList?.(params, enabled) ??
      queryOptions({
        queryKey: [
          'dyna',
          params.endpoint,
          params.schemaKey,
          params.page,
          params.size,
          params.search,
        ] as readonly unknown[],
        queryFn: ({ signal }: { signal: AbortSignal }) => listRequest(params, { signal }),
        enabled,
      }),
    filter: () =>
      scopedList?.filter({ schemaKey: schema.key, endpoint: schema.endpoint }) ?? {
        queryKey: ['dyna', schema.endpoint, schema.key],
      },
    create: operation(schema.createPerm, (transport, body: Row) =>
      request<Row>(schema.endpoint, { method: 'POST', body, ...transport }),
    ),
    edit: operation(schema.rowActions?.find((action) => action.kind === 'edit')?.perm, update),
    remove: operation(
      schema.rowActions?.find((action) => action.kind === 'delete')?.perm,
      (transport, id: string) =>
        request<void>(`${schema.endpoint}/${id}`, { method: 'DELETE', ...transport }),
    ),
    toggles,
  }
}
