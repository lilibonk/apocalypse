import { describe, expect, it } from 'vitest'

import { isDictionaryQuery } from './dict-book.model'

describe('dictionary write cache propagation', () => {
  it('refreshes both management views and shared labels after a type or value write', () => {
    for (const key of [
      ['system', 'dict', 'book', 'types', '', 2],
      ['system', 'dict', 'book', 'values', 'custom_status', 3],
      ['system', 'dict', 'book', 'preview', 'renamed_status'],
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
})
