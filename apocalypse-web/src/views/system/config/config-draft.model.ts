import type { ConfigRow, ConfigValueItem } from './config.api'

/** One unsaved value, remembering the baseline it was edited against. */
export interface ConfigDraftItem {
  value: string
  baseValue: string | null
  baseVersion: number
  /** Display context belongs to this draft, so review survives pagination and route restoration. */
  configKey?: string
  configName?: string
  /** Preserves the pre-rebase baseline when a 40900 reload rebases `baseValue` onto the latest server row. */
  conflictBaseValue?: string | null
  /** Populated when a 40900 reload finds a different server version and value. */
  conflictServerValue?: string | null
  conflictServerVersion?: number
}

export type ConfigDraft = Readonly<Record<string, ConfigDraftItem>>

export interface ConfigGroupMeta {
  key: string
  label: string
}

export type ConfigControlSpec =
  | { kind: 'boolean' }
  | { kind: 'enum'; options: readonly { value: string; label: string }[] }
  | { kind: 'secret' }
  | { kind: 'multiline' }
  | { kind: 'text' }

export function normalizeValue(value: string | null | undefined) {
  return value ?? ''
}

/** Apply an edit; returns the draft without the item when it matches the baseline again. */
export function editDraft(draft: ConfigDraft, row: ConfigRow, value: string): ConfigDraft {
  const existing = draft[row.id]
  const baseValue = existing ? existing.baseValue : row.configValue
  const baseVersion = existing ? existing.baseVersion : row.version
  if (value === normalizeValue(baseValue) && existing?.conflictServerVersion === undefined) {
    const next = { ...draft }
    delete next[row.id]
    return next
  }
  return {
    ...draft,
    [row.id]: {
      ...existing,
      value,
      baseValue,
      baseVersion,
      configKey: row.configKey,
      configName: row.configName,
    },
  }
}

export function undoDraft(draft: ConfigDraft, id: string): ConfigDraft {
  const next = { ...draft }
  delete next[id]
  return next
}

/** Rows whose server version moved since the draft was made. */
export function conflictedIds(draft: ConfigDraft, rows: readonly ConfigRow[]): Set<string> {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return new Set(
    Object.entries(draft)
      .filter(([id, item]) => {
        const row = byId.get(id)
        return row !== undefined && row.version !== item.baseVersion
      })
      .map(([id]) => id),
  )
}

/**
 * Save payload. Conflicted rows are only submitted after the user re-bases them on the latest
 * version (see `rebaseDraft` and `resolveConflictUseMine`); unknown rows (deleted elsewhere) are
 * submitted as-is and the server answers 404, keeping the whole batch atomic.
 */
export function saveItems(draft: ConfigDraft): ConfigValueItem[] {
  return Object.entries(draft).map(([id, item]) => ({
    id,
    expectedVersion: item.baseVersion,
    configValue: item.value,
  }))
}

/**
 * Keep the user's values while rebasing `baseValue` and `baseVersion` onto the latest server
 * rows, and preserving the original `conflictBaseValue` for 3-way audit comparison.
 */
export function rebaseDraft(draft: ConfigDraft, rows: readonly ConfigRow[]): ConfigDraft {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const next: Record<string, ConfigDraftItem> = {}
  for (const [id, item] of Object.entries(draft)) {
    const row = byId.get(id)
    if (!row) {
      next[id] = item
      continue
    }
    if (item.value === normalizeValue(row.configValue)) continue
    const versionMoved = row.version !== item.baseVersion
    next[id] = {
      ...item,
      value: item.value,
      baseValue: row.configValue,
      baseVersion: row.version,
      configKey: row.configKey,
      configName: row.configName,
      ...(versionMoved
        ? {
            conflictBaseValue: item.conflictBaseValue ?? item.baseValue,
            conflictServerValue: row.configValue,
            conflictServerVersion: row.version,
          }
        : {}),
    }
  }
  return next
}

/** Resolve a 3-way conflict by adopting the user's draft value on top of the latest server baseline. */
export function resolveConflictUseMine(
  draft: ConfigDraft,
  id: string,
  latestRow?: Pick<ConfigRow, 'configValue' | 'version'>,
): ConfigDraft {
  const item = draft[id]
  if (!item) return draft
  const nextBaseValue =
    latestRow !== undefined
      ? latestRow.configValue
      : item.conflictServerValue !== undefined
        ? item.conflictServerValue
        : item.baseValue
  const nextBaseVersion =
    latestRow !== undefined ? latestRow.version : (item.conflictServerVersion ?? item.baseVersion)
  if (item.value === normalizeValue(nextBaseValue)) {
    return undoDraft(draft, id)
  }
  return {
    ...draft,
    [id]: {
      value: item.value,
      baseValue: nextBaseValue,
      baseVersion: nextBaseVersion,
      configKey: item.configKey,
      configName: item.configName,
    },
  }
}

/** Resolve a 3-way conflict by discarding the local edit and adopting the latest server value. */
export function resolveConflictUseServer(draft: ConfigDraft, id: string): ConfigDraft {
  return undoDraft(draft, id)
}

/** Group key: first dot/colon separated segment of the parameter key. */
export function configGroup(key: string) {
  const match = /^[^.:]+/.exec(key)
  return match ? match[0] : key
}

const SEMANTIC_PREFIX_GROUPS: readonly { prefix: RegExp; key: string; label: string }[] = [
  { prefix: /^sys[.:]user([.:]|$)/i, key: 'sys.user', label: '用户管理' },
  { prefix: /^sys[.:]account([.:]|$)/i, key: 'sys.account', label: '账号自助' },
  { prefix: /^(sys[.:]index|frame)([.:]|$)/i, key: 'sys.index', label: '主框架' },
  {
    prefix: /^sys[.:](security|auth|login|captcha)([.:]|$)/i,
    key: 'sys.security',
    label: '安全策略',
  },
  { prefix: /^demo([.:]|$)/i, key: 'demo', label: '演示参数' },
]

/**
 * 2-level semantic prefix group resolution (`sys.user`, `sys.account`, `sys.index`,
 * `sys.security`, `demo`, etc.) so `sys.*` parameters do not collapse into a single giant group.
 */
export function resolveConfigGroupMeta(configKey: string): ConfigGroupMeta {
  const trimmed = configKey.trim()
  for (const entry of SEMANTIC_PREFIX_GROUPS) {
    if (entry.prefix.test(trimmed)) {
      return { key: entry.key, label: entry.label }
    }
  }
  const segments = trimmed.split(/[.:]/).filter(Boolean)
  if (segments.length >= 2 && segments[0].toLowerCase() === 'sys') {
    const subKey = `sys.${segments[1]}`
    return { key: subKey, label: `系统 · ${segments[1]}` }
  }
  const fallback = configGroup(trimmed) || 'general'
  return { key: fallback, label: fallback }
}

/** Infer the appropriate control widget for a configuration row. */
export function inferConfigControl(
  row: Pick<ConfigRow, 'configKey' | 'configValue' | 'remark'>,
  currentValue?: string,
): ConfigControlSpec {
  const raw = (currentValue ?? row.configValue ?? '').trim()
  const base = (row.configValue ?? '').trim()
  const keyLower = row.configKey.toLowerCase()

  if (/(password|secret|token|credential|private)/i.test(keyLower)) {
    return { kind: 'secret' }
  }
  if (/^(true|false)$/i.test(raw) || /^(true|false)$/i.test(base)) {
    return { kind: 'boolean' }
  }
  if (
    /(mode|enum)$/i.test(keyLower) &&
    (/^(light|dark|system)$/i.test(raw) || /^(light|dark|system)$/i.test(base))
  ) {
    return {
      kind: 'enum',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'system', label: 'System' },
      ],
    }
  }
  if (raw.includes('\n') || raw.length > 80 || base.includes('\n') || base.length > 80) {
    return { kind: 'multiline' }
  }
  return { kind: 'text' }
}
