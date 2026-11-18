import { beforeEach, describe, expect, it, vi } from 'vitest'

import { batchDictValues, pageDictTypes, pageDictValues } from './dict-book.api'

const request = vi.hoisted(() => vi.fn(async () => ({ list: [], total: 0 })))
vi.mock('@/lib/api/client', () => ({ request }))

beforeEach(() => request.mockClear())

describe('dictionary complete page access', () => {
  it('forwards later type pages, page size and the applied keyword to the existing server query', async () => {
    const signal = new AbortController().signal
    await pageDictTypes('department', 3, signal, 1, 24)
    expect(request).toHaveBeenCalledWith('/system/dict/types/page', {
      query: { page: 3, size: 24, keyword: 'department', status: 1 },
      signal,
    })
  })

  it('loads later value pages and custom size only for the selected dictionary type', async () => {
    await pageDictValues('custom_status', 11, undefined, 50)
    expect(request).toHaveBeenCalledWith('/system/dict/data/page', {
      query: { page: 11, size: 50, dictType: 'custom_status' },
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
