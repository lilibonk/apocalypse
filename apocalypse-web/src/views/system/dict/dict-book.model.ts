import type { DictTone } from '@/lib/api/types'
import type { DictTypeRow, DictValueRow } from './dict-book.api'

export const DICT_TONES: readonly DictTone[] = [
  'BRAND',
  'INFO',
  'SUCCESS',
  'WARNING',
  'DANGER',
  'NEUTRAL',
] as const

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

export function resolveDictSwatchTone(
  dictTypeOrValue:
    string | (Pick<DictValueRow, 'dictType' | 'dictValue' | 'tagTone'> & Partial<DictValueRow>),
  maybeValue?: Pick<DictValueRow, 'dictValue' | 'tagTone'> & Partial<DictValueRow>,
): DictTone {
  const dictType = typeof dictTypeOrValue === 'string' ? dictTypeOrValue : dictTypeOrValue.dictType
  const value = typeof dictTypeOrValue === 'string' ? maybeValue! : dictTypeOrValue
  if (value.tagTone && DICT_TONES.includes(value.tagTone) && value.tagTone !== 'NEUTRAL') {
    return value.tagTone
  }
  const code = String(value.dictValue)
  if (
    (dictType === 'sys_user_status' ||
      dictType === 'sys_common_status' ||
      dictType === 'sys_normal_disable') &&
    code === '1'
  ) {
    return 'SUCCESS'
  }
  if ((dictType === 'sys_common_status' || dictType === 'sys_normal_disable') && code === '0') {
    return 'DANGER'
  }
  if (dictType === 'sys_user_status' && code === '0') {
    return 'WARNING'
  }
  if (dictType === 'sys_user_sex' && code === '1') {
    return 'BRAND'
  }
  if (dictType === 'sys_user_sex' && code === '2') {
    return 'INFO'
  }
  return value.tagTone ?? 'NEUTRAL'
}

export interface DictRatioSummary {
  total: number
  enabled: number
  disabled: number
  enabledPercent: number
  disabledPercent: number
}

export function computeDictRatio(
  values: readonly (Pick<DictValueRow, 'status'> & Partial<DictValueRow>)[],
): DictRatioSummary {
  const total = values.length
  if (total === 0) {
    return { total: 0, enabled: 0, disabled: 0, enabledPercent: 0, disabledPercent: 0 }
  }
  const enabled = values.filter((item) => item.status === 1).length
  const disabled = total - enabled
  const enabledPercent = Math.round((enabled / total) * 100)
  const disabledPercent = Math.max(0, 100 - enabledPercent)
  return { total, enabled, disabled, enabledPercent, disabledPercent }
}

export interface DictTypeChange {
  id: string
  dictType: string
  name: string
  action: 'created' | 'updated' | 'enabled' | 'disabled' | 'deleted'
  row?: DictTypeRow
}
