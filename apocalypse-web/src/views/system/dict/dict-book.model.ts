import type { DictTypeRow } from './dict-book.api'

/** A type/value write affects the card book, its compatible Dyna pages and shared value labels. */
export function isDictionaryQuery(queryKey: readonly unknown[]) {
  return (
    (queryKey[0] === 'system' && queryKey[1] === 'dict') ||
    queryKey[0] === 'dict' ||
    (queryKey[0] === 'dyna' &&
      (queryKey[1] === '/system/dict/types' || queryKey[1] === '/system/dict/data'))
  )
}

export function lastDictionaryPage(total: number, size: number) {
  return Math.max(1, Math.ceil(total / size))
}

export interface DictTypeChange {
  id: string
  dictType: string
  name: string
  action: 'created' | 'updated' | 'enabled' | 'disabled' | 'deleted'
  row?: DictTypeRow
}
