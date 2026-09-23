import { beforeEach, describe, expect, it, vi } from 'vitest'

import { request } from '@/lib/api/client'

import { GRANT_USERS_PAGE_SIZE, loadAssignedUserIds } from './grant-users'

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  request: vi.fn(),
}))

const mockedRequest = vi.mocked(request)
const result = (page: number, total: number, start: number, length: number) => ({
  list: Array.from({ length }, (_, index) => ({ id: String(start + index) })),
  total,
  page,
  size: GRANT_USERS_PAGE_SIZE,
})

beforeEach(() => mockedRequest.mockReset())

describe('complete role assignment baseline', () => {
  it('loads every assigned page at the enforced limit, including non-visible candidate users', async () => {
    mockedRequest
      .mockResolvedValueOnce(result(1, 405, 1, 200))
      .mockResolvedValueOnce(result(2, 405, 201, 200))
      .mockResolvedValueOnce(result(3, 405, 401, 5))
    const signal = new AbortController().signal
    const ids = await loadAssignedUserIds('role-1', signal)
    expect(ids).toHaveLength(405)
    expect(ids).toContain('405')
    expect(mockedRequest.mock.calls.map(([path, options]) => [path, options?.query])).toEqual([
      ['/system/roles/role-1/users', { page: 1, size: 200 }],
      ['/system/roles/role-1/users', { page: 2, size: 200 }],
      ['/system/roles/role-1/users', { page: 3, size: 200 }],
    ])
    for (const [, options] of mockedRequest.mock.calls) expect(options?.signal).toBe(signal)
  })

  it('rejects a later-page failure instead of returning a destructive partial selection', async () => {
    mockedRequest
      .mockResolvedValueOnce(result(1, 201, 1, 200))
      .mockRejectedValueOnce(new Error('second page unavailable'))
    await expect(loadAssignedUserIds('role-1', new AbortController().signal)).rejects.toThrow(
      'second page unavailable',
    )
  })

  it('stops after cancellation even if the completed transport ignored its signal', async () => {
    const controller = new AbortController()
    mockedRequest.mockImplementationOnce(async () => {
      controller.abort()
      return result(1, 201, 1, 200)
    })
    await expect(loadAssignedUserIds('role-1', controller.signal)).rejects.toThrow()
    expect(mockedRequest).toHaveBeenCalledOnce()
  })

  it.each([
    ['a missing page', result(2, 201, 201, 0)],
    ['duplicate users across pages', result(2, 201, 1, 1)],
    ['membership count changing during the load', result(2, 202, 201, 2)],
    ['a response for the wrong page', result(1, 201, 201, 1)],
  ])('rejects %s', async (_label, second) => {
    mockedRequest.mockResolvedValueOnce(result(1, 201, 1, 200)).mockResolvedValueOnce(second)
    await expect(loadAssignedUserIds('role-1', new AbortController().signal)).rejects.toThrow(
      '未完整加载',
    )
  })

  it('accepts a verified empty role and rereads changed assignments on the next load', async () => {
    mockedRequest.mockResolvedValueOnce(result(1, 0, 1, 0))
    await expect(loadAssignedUserIds('role-1', new AbortController().signal)).resolves.toEqual([])
    mockedRequest.mockResolvedValueOnce(result(1, 1, 99, 1))
    await expect(loadAssignedUserIds('role-1', new AbortController().signal)).resolves.toEqual([
      '99',
    ])
    expect(mockedRequest).toHaveBeenCalledTimes(2)
  })
})
