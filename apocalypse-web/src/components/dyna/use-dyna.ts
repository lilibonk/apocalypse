/**
 * DynaLayer 共享 hooks：
 * - useDynaText：label 原文 → t(`dyna.${原文}`, { defaultValue: 原文 })，与菜单 i18n 同款的兜底原文模式；
 *   支持插值参数（语义键模板：dyna.created / dyna.deleteHint / dyna.msg* 等）。
 * - useFieldOptions：select/radio 静态 options 或 dict 动态 options 的统一出口。
 */

import { useTranslation } from 'react-i18next'

import { useDict } from '@/components/DictTag'

import type { DynaOption } from './schema'

export function useDynaText(): (text: string, params?: Record<string, string | number>) => string {
  const { t } = useTranslation()
  return (text, params) => t(`dyna.${text}`, { defaultValue: text, ...params })
}

/** 静态 options 优先；绑了 dictType 走字典（react-query 缓存，见 DictTag.tsx 的 useDict）。 */
export function useFieldOptions(field: {
  options?: DynaOption[]
  dictType?: string
}): DynaOption[] {
  const dictQuery = useDict(field.dictType ?? '')
  if (field.options) return field.options
  if (!field.dictType) return []
  return (dictQuery.data ?? []).map((item) => ({ label: item.dictLabel, value: item.dictValue }))
}
