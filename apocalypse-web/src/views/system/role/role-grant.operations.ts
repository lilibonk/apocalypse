import { request } from '@/lib/api/client'
import type { RoleGraphTransport } from './role-graph.operations'
import type { roleGrantSubmission } from './role-grant.model'

export async function saveRoleGrants(
  transport: RoleGraphTransport,
  roleId: string,
  submission: ReturnType<typeof roleGrantSubmission>,
) {
  transport.assertCurrent()
  // Snapshot all mutable collections at dispatch. The server compares both revisions atomically.
  const body = {
    ...submission,
    upsert: submission.upsert.map((grant) => ({ ...grant })),
    remove: [...submission.remove],
  }
  await request<void>(`/system/roles/${roleId}/permissions`, {
    method: 'PUT',
    body,
    signal: transport.signal,
    context: transport.context,
  })
  transport.assertCurrent()
}
