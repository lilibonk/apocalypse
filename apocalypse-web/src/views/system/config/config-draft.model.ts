import type { ConfigRow, ConfigValueItem } from './config.api'

/** One unsaved value, remembering the baseline it was edited against. */
export interface ConfigDraftItem {
  value: string
  baseValue: string | null
  baseVersion: number
  /** Display context belongs to this draft, so review survives pagination and route restoration. */
  configKey?: string
  configName?: string
}

export type ConfigDraft = Readonly<Record<string, ConfigDraftItem>>

export function normalizeValue(value: string | null | undefined) {
  return value ?? ''
}

/** Apply an edit; returns the draft without the item when it matches the baseline again. */
export function editDraft(draft: ConfigDraft, row: ConfigRow, value: string): ConfigDraft {
  const existing = draft[row.id]
  const baseValue = existing ? existing.baseValue : row.configValue
  const baseVersion = existing ? existing.baseVersion : row.version
  if (value === normalizeValue(baseValue)) {
    const next = { ...draft }
    delete next[row.id]
    return next
  }
  return {
    ...draft,
    [row.id]: {
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

/** Rows whose server version moved since the draft was made: someone else changed them. */
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
 * version (see `rebaseDraft`); unknown rows (deleted elsewhere) are submitted as-is and the server
 * answers 404, keeping the whole batch atomic.
 */
export function saveItems(draft: ConfigDraft): ConfigValueItem[] {
  return Object.entries(draft).map(([id, item]) => ({
    id,
    expectedVersion: item.baseVersion,
    configValue: item.value,
  }))
}

/** Keep the user's values but adopt the latest server version and value as the new baseline. */
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
    next[id] = {
      ...item,
      value: item.value,
      baseValue: row.configValue,
      baseVersion: row.version,
      configKey: row.configKey,
      configName: row.configName,
    }
  }
  return next
}

/** Group key: first dot/colon separated segment of the parameter key. */
export function configGroup(key: string) {
  const match = /^[^.:]+/.exec(key)
  return match ? match[0] : key
}
