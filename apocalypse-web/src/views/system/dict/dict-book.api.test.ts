import { beforeEach, describe, expect, it, vi } from 'vitest'

import { batchDictValues, pageDictTypes, pageDictValues } from './dict-book.api'

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

  it('fetches batch dictionary values in one request for sample book cards', async () => {
    request.mockResolvedValueOnce({ sys_normal_disable: [] } as never)
    const signal = new AbortController().signal
    await batchDictValues(['sys_normal_disable', 'sys_user_sex'], signal)
    expect(request).toHaveBeenCalledWith('/system/dict/data/batch', {
      query: { dictTypes: 'sys_normal_disable,sys_user_sex' },
      signal,
    })
  })
})
