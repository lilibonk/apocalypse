import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { saveRoleGrants } from './role-grant.operations'
import type { RoleGraphTransport } from './role-graph.operations'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/lib/api/client', async (original) => ({
  ...(await original<typeof import('@/lib/api/client')>()),
  request,
}))
const transport = (): RoleGraphTransport => ({
  signal: new AbortController().signal,
  assertCurrent: vi.fn(),
  context: { principalEpoch: 1, scoped: false, assertCurrent: vi.fn() },
})
const submission = () => ({
  expectedRevision: '9223372036854775801',
  expectedCatalogRevision: '9',
  upsert: [
    {
      permissionId: '9223372036854775806',
      enabled: true,
      scopeOverride: 'DEPT' as const,
      validFrom: '2026-10-18T00:00:00Z',
      validUntil: null,
    },
  ],
  remove: ['opaque-id'],
})
beforeEach(() => {
  request.mockReset()
})
describe('versioned role permission delta', () => {
  it('snapshots both collections and retains exact revisions and request context', async () => {
    let finish!: () => void
    request.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const body = submission(),
      captured = transport()
    const pending = saveRoleGrants(captured, 'role-1', body)
    body.upsert[0]!.enabled = false
    body.remove.push('late-change')
    expect(request).toHaveBeenCalledExactlyOnceWith('/system/roles/role-1/permissions', {
      method: 'PUT',
      body: submission(),
      signal: captured.signal,
      context: captured.context,
    })
    finish()
    await pending
    expect(captured.assertCurrent).toHaveBeenCalledTimes(2)
  })
  it.each([40300, 40400, 40900])(
    'propagates server code %s without retrying or dropping the revision',
    async (code) => {
      const error = new ApiError(code, 'server message')
      request.mockRejectedValue(error)
      await expect(saveRoleGrants(transport(), 'role-1', submission())).rejects.toBe(error)
      expect(request).toHaveBeenCalledTimes(1)
    },
  )
  it('rejects late success when the captured authorization is no longer current', async () => {
    const captured = transport()
    vi.mocked(captured.assertCurrent)
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('authorization ended')
      })
    request.mockResolvedValue(undefined)
    await expect(saveRoleGrants(captured, 'role-1', submission())).rejects.toThrow(
      'authorization ended',
    )
  })
})
