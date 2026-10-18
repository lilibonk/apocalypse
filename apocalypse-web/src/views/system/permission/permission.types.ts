import type { SnowflakeId } from '@/lib/api/types'

export const scopeOverrides = ['INHERIT_ROLE', 'ALL', 'DEPT', 'DEPT_AND_CHILDREN'] as const
export type ScopeOverride = (typeof scopeOverrides)[number]
export type PermissionLifecycle = 'ACTIVE' | 'DEPRECATED' | 'LEGACY'

/** Definitions describe deployed actions; editing metadata never creates executable code. */
export interface PermissionDefinition {
  id: SnowflakeId
  code: string
  name: string
  description: string | null
  moduleKey: string | null
  resource: string
  action: string
  status: number
  lifecycle: PermissionLifecycle
  version: number
  supportedScopeOverrides: ScopeOverride[]
  declarationSource: string
  registered: boolean
  referenceRoleCount: string
}

export function canConfigurePermission(definition: PermissionDefinition | null | undefined) {
  return Boolean(
    definition?.registered && definition.status === 1 && definition.lifecycle === 'ACTIVE',
  )
}
