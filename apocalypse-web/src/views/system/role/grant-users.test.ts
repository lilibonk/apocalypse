import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAssignedUserIds } from './grant-users'
const { request, assertCurrent } = vi.hoisted(() => ({ request: vi.fn(), assertCurrent: vi.fn() }))
vi.mock('@/lib/api/client', async (original) => ({
  ...(await original<typeof import('@/lib/api/client')>()),
  request,
  captureRequestContext: () => ({ assertCurrent }),
}))
beforeEach(() => {
  request.mockReset()
  assertCurrent.mockReset()
})
describe('complete role assignment baseline', () => {
  it('uses the full ID endpoint, preserving invisible users and exact snowflake IDs', async () => {
    const ids = Array.from({ length: 405 }, (_, i) => String(i + 1))
    ids.push('9223372036854775801')
    request.mockResolvedValue(ids)
    const signal = new AbortController().signal
    expect(await loadAssignedUserIds('role-1', signal)).toEqual(ids)
    expect(request).toHaveBeenCalledExactlyOnceWith('/system/roles/role-1/user-ids', {
      signal,
      context: { assertCurrent },
    })
    expect(assertCurrent).toHaveBeenCalledTimes(2)
  })
  it('propagates baseline denial without publishing a partial selection', async () => {
    request.mockRejectedValue(new Error('baseline denied'))
    await expect(loadAssignedUserIds('role-1', new AbortController().signal)).rejects.toThrow(
      'baseline denied',
    )
  })
  it('rejects a late result after cancellation', async () => {
    const controller = new AbortController()
    request.mockImplementation(async () => {
      controller.abort()
      return ['1']
    })
    await expect(loadAssignedUserIds('role-1', controller.signal)).rejects.toThrow()
  })
  it.each([['1', '1'], ['1', 2], [null], { list: [{ id: '1' }], total: 1 }, ['']])(
    'rejects an invalid complete-ID response %j',
    async (response) => {
      request.mockResolvedValue(response)
      await expect(loadAssignedUserIds('role-1', new AbortController().signal)).rejects.toThrow(
        '未完整加载',
      )
    },
  )
  it('accepts an empty role and rereads new assignments', async () => {
    request.mockResolvedValueOnce([]).mockResolvedValueOnce(['99'])
    await expect(loadAssignedUserIds('role-1', new AbortController().signal)).resolves.toEqual([])
    await expect(loadAssignedUserIds('role-1', new AbortController().signal)).resolves.toEqual([
      '99',
    ])
  })
})
