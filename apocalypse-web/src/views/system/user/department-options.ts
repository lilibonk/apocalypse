import { queryOptions } from '@tanstack/react-query'

import { request } from '@/lib/api/client'
import type { DynaOption } from '@/components/dyna/schema'
import type { DeptTreeNode } from '../dept/types'

export function departmentOptionsQuery(mode: 'create' | 'edit', sessionEpoch: number) {
  const operation = mode === 'create' ? 'CREATE' : 'UPDATE'
  return queryOptions({
    queryKey: ['system', 'users', 'department-options', operation, sessionEpoch],
    queryFn: ({ signal }) =>
      request<DeptTreeNode[]>('/system/users/department-options', { query: { operation }, signal }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

/** Use server-provided options only; IDs remain strings and business names remain raw. */
export function flattenDepartmentOptions(tree: DeptTreeNode[], prefix = ''): DynaOption[] {
  return tree.flatMap((node) => {
    const label = prefix ? `${prefix} / ${node.deptName}` : node.deptName
    return [{ value: node.id, label }, ...flattenDepartmentOptions(node.children ?? [], label)]
  })
}
