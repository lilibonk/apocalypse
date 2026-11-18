import type { EntityKind } from '@/components/navigation'
import {
  toDateBeginIso,
  toExclusiveDateEndIso,
  type LogInsightRange,
} from '@/views/system/log/log-insight.api'
import { isKnownOperType } from '../../i18n/oper-log'
import type { OperLogRow, OperStreamFilter } from './oper-log.api'

export interface OperCausalFilter {
  range: LogInsightRange
  businessType?: string
  status?: 0 | 1
}

/** JSON 可解析时格式化（2 空格），否则原样返回；不改写业务原文。 */
export function formatPayload(value: string | null): string | null {
  const text = value?.trim()
  if (!text) return null
  if (!/^[[{]/.test(text)) return value
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return value
  }
}

/** User-facing label for a business type code; the raw code is never shown as the label itself. */
export function operTypeLabel(
  code: string | null,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (!code) return t('operLog.unrecorded')
  return isKnownOperType(code) ? t(`operLog.type.${code}`) : t('operLog.other', { code })
}

export function hasActiveOperFilter(filter: OperCausalFilter): boolean {
  return filter.businessType !== undefined || filter.status !== undefined
}

export interface OperSearchFilters {
  businessType?: string
  status?: string
  dateBegin?: string
  dateEnd?: string
}

export function buildOperStreamQuery(
  keyword: string,
  filter: OperCausalFilter,
  search?: OperSearchFilters,
): OperStreamFilter {
  const trimmed = keyword.trim()
  const active = hasActiveOperFilter(filter)
  const searchStatus = search?.status === '1' ? 1 : search?.status === '0' ? 0 : undefined
  return {
    keyword: trimmed || undefined,
    businessType: filter.businessType ?? (search?.businessType || undefined),
    status: filter.status ?? searchStatus,
    range: active ? filter.range : undefined,
    bucketFrom: toDateBeginIso(search?.dateBegin),
    bucketTo: toExclusiveDateEndIso(search?.dateEnd),
  }
}

export type PayloadTokenKind =
  'plain' | 'masked' | 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation'

export interface PayloadToken {
  text: string
  kind: PayloadTokenKind
  masked: boolean
}

/** Split formatted payload text around `"******"` so masked values can be highlighted in the UI. */
export function splitMaskedSegments(formatted: string): { text: string; masked: boolean }[] {
  const parts = formatted.split(/("?\*{6}"?)/g).filter((part) => part.length > 0)
  return parts.map((text) => ({
    text,
    masked: /^\*{6}$|^"\*{6}"$/.test(text),
  }))
}

/**
 * Tokenize formatted JSON payloads into syntax-colored segments (keys, strings, numbers, booleans,
 * null, punctuation, and `"******"` masked values) while preserving non-JSON text (such as Java
 * method signatures) as unfragmented segments.
 */
export function tokenizePayloadSegments(formatted: string): PayloadToken[] {
  if (!/^[[{]/.test(formatted.trim())) {
    return splitMaskedSegments(formatted).map((seg) => ({
      text: seg.text,
      kind: seg.masked ? 'masked' : 'plain',
      masked: seg.masked,
    }))
  }

  const tokens: PayloadToken[] = []
  const pattern =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(formatted)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        text: formatted.slice(lastIndex, match.index),
        kind: 'punctuation',
        masked: false,
      })
    }

    const [, strLiteral, colonSuffix, boolLiteral, nullLiteral, numLiteral] = match
    if (strLiteral !== undefined) {
      if (colonSuffix !== undefined) {
        tokens.push({ text: strLiteral, kind: 'key', masked: false })
        tokens.push({ text: colonSuffix, kind: 'punctuation', masked: false })
      } else if (/^"\*{6}"$/.test(strLiteral)) {
        tokens.push({ text: strLiteral, kind: 'masked', masked: true })
      } else if (strLiteral.includes('******')) {
        for (const sub of splitMaskedSegments(strLiteral)) {
          tokens.push({
            text: sub.text,
            kind: sub.masked ? 'masked' : 'string',
            masked: sub.masked,
          })
        }
      } else {
        tokens.push({ text: strLiteral, kind: 'string', masked: false })
      }
    } else if (boolLiteral !== undefined) {
      tokens.push({ text: boolLiteral, kind: 'boolean', masked: false })
    } else if (nullLiteral !== undefined) {
      tokens.push({ text: nullLiteral, kind: 'null', masked: false })
    } else if (numLiteral !== undefined) {
      tokens.push({ text: numLiteral, kind: 'number', masked: false })
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < formatted.length) {
    tokens.push({
      text: formatted.slice(lastIndex),
      kind: 'punctuation',
      masked: false,
    })
  }

  return tokens
}

/** Infer a navigable target domain entity from an operation log's title or Java method signature. */
export function resolveOperTargetEntity(
  row: Pick<OperLogRow, 'title' | 'method'>,
): { kind: EntityKind; id: string; label: string } | null {
  const haystack = `${row.title ?? ''} ${row.method ?? ''}`.toLowerCase()
  if (haystack.includes('user') || haystack.includes('用户')) {
    return { kind: 'user', id: 'list', label: row.title || '用户管理' }
  }
  if (haystack.includes('role') || haystack.includes('角色')) {
    return { kind: 'role', id: 'list', label: row.title || '角色管理' }
  }
  if (haystack.includes('dept') || haystack.includes('部门')) {
    return { kind: 'dept', id: 'list', label: row.title || '部门管理' }
  }
  if (haystack.includes('menu') || haystack.includes('菜单')) {
    return { kind: 'menu', id: 'list', label: row.title || '菜单管理' }
  }
  if (haystack.includes('permission') || haystack.includes('权限')) {
    return { kind: 'permission', id: 'list', label: row.title || '权限目录' }
  }
  if (haystack.includes('dict') || haystack.includes('字典')) {
    return { kind: 'dict', id: 'list', label: row.title || '字典管理' }
  }
  if (haystack.includes('config') || haystack.includes('参数')) {
    return { kind: 'config', id: 'list', label: row.title || '参数设置' }
  }
  if (haystack.includes('calendar') || haystack.includes('万年历') || haystack.includes('日历')) {
    return { kind: 'calendar', id: 'list', label: row.title || '万年历' }
  }
  return null
}
