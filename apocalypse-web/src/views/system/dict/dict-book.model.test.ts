import { describe, expect, it } from 'vitest'

import { computeDictRatio, isDictionaryQuery, resolveDictSwatchTone } from './dict-book.model'

describe('dictionary write cache propagation', () => {
  it('refreshes both management views and shared labels after a type or value write', () => {
    for (const key of [
      ['system', 'dict', 'book', 'types', '', 2],
      ['system', 'dict', 'book', 'values', 'custom_status', 3],
      ['system', 'dict', 'book', 'preview', 'renamed_status'],
      ['system', 'dict', 'book', 'batch-values', 'custom_status'],
      ['dyna', '/system/dict/types', 'system-dict-type', 2],
      ['dyna', '/system/dict/data', 'system-dict-data', 4],
      ['dict', 'custom_status'],
    ])
      expect(isDictionaryQuery(key)).toBe(true)
  })

  it('does not refresh unrelated business resources or similarly named endpoints', () => {
    for (const key of [
      ['system', 'users'],
      ['system', 'dictionary-report'],
      ['dyna', '/system/dict/types-audit', 'history'],
      ['dyna', '/system/users', 'system-user'],
      ['calendar', 'events'],
      [],
    ])
      expect(isDictionaryQuery(key)).toBe(false)
  })

  it('computes enabled/disabled ratio and resolves swatch tone with fallback', () => {
    const ratio = computeDictRatio([
      {
        id: '1',
        dictType: 'sys_normal_disable',
        dictLabel: '正常',
        dictValue: '1',
        sort: 1,
        status: 1,
        tagTone: 'SUCCESS',
        isDefault: 1,
        remark: null,
      },
      {
        id: '2',
        dictType: 'sys_normal_disable',
        dictLabel: '停用',
        dictValue: '0',
        sort: 2,
        status: 0,
        tagTone: 'DANGER',
        isDefault: 0,
        remark: null,
      },
    ])
    expect(ratio).toEqual({
      total: 2,
      enabled: 1,
      disabled: 1,
      enabledPercent: 50,
      disabledPercent: 50,
    })
    expect(
      resolveDictSwatchTone({
        id: '1',
        dictType: 'sys_normal_disable',
        dictLabel: '正常',
        dictValue: '1',
        sort: 1,
        status: 1,
        tagTone: 'BRAND',
        remark: null,
      }),
    ).toBe('BRAND')
    expect(
      resolveDictSwatchTone({
        id: '2',
        dictType: 'sys_normal_disable',
        dictLabel: '停用',
        dictValue: '0',
        sort: 2,
        status: 0,
        tagTone: null,
        remark: null,
      }),
    ).toBe('DANGER')
  })
})
