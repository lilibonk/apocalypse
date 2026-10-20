import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pageDictTypes, pageDictValues } from './dict-book.api'

const request = vi.hoisted(() => vi.fn(async () => ({ list: [], total: 0 })))
vi.mock('@/lib/api/client', () => ({ request }))

beforeEach(() => request.mockClear())

describe('dictionary complete page access', () => {
  it('forwards later type pages and the applied keyword to the existing server query', async () => {
    const signal = new AbortController().signal
    await pageDictTypes('department', 3, signal)
    expect(request).toHaveBeenCalledWith('/system/dict/types/page', {
      query: { page: 3, size: expect.any(Number), keyword: 'department' },
      signal,
    })
  })

  it('loads later value pages only for the selected dictionary type', async () => {
    await pageDictValues('custom_status', 11)
    expect(request).toHaveBeenCalledWith('/system/dict/data/page', {
      query: { page: 11, size: expect.any(Number), dictType: 'custom_status' },
      signal: undefined,
    })
  })
})
