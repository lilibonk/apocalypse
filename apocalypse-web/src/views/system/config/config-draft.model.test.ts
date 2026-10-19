import { describe, expect, it } from 'vitest'

import {
  configGroup,
  conflictedIds,
  editDraft,
  rebaseDraft,
  saveItems,
  undoDraft,
} from './config-draft.model'
import type { ConfigRow } from './config.api'

const row = (id: string, value: string | null, version = 0): ConfigRow => ({
  id,
  configKey: `frame.${id}`,
  configName: id,
  configValue: value,
  remark: null,
  version,
})

describe('config draft model', () => {
  it('tracks edits against the original baseline and drops items edited back', () => {
    let draft = editDraft({}, row('a', 'light'), 'dark')
    expect(draft.a).toEqual({ value: 'dark', baseValue: 'light', baseVersion: 0 })
    draft = editDraft(draft, row('a', 'light'), 'system')
    expect(draft.a.baseValue).toBe('light')
    expect(editDraft(draft, row('a', 'light'), 'light')).toEqual({})
    expect(editDraft({}, row('n', null), '')).toEqual({})
    expect(undoDraft(draft, 'a')).toEqual({})
  })

  it('submits the version each value was edited against', () => {
    const draft = editDraft(editDraft({}, row('a', 'x', 3), 'y'), row('b', '1', 7), '2')
    expect(saveItems(draft)).toEqual([
      { id: 'a', expectedVersion: 3, configValue: 'y' },
      { id: 'b', expectedVersion: 7, configValue: '2' },
    ])
  })

  it('detects rows changed elsewhere and rebases without losing the user value', () => {
    const draft = editDraft({}, row('a', 'light', 1), 'dark')
    const latest = [row('a', 'system', 2)]
    expect(conflictedIds(draft, latest)).toEqual(new Set(['a']))
    const rebased = rebaseDraft(draft, latest)
    expect(rebased.a).toEqual({ value: 'dark', baseValue: 'system', baseVersion: 2 })
    expect(rebaseDraft(draft, [row('a', 'dark', 2)])).toEqual({})
  })

  it('groups keys by their first segment', () => {
    expect(configGroup('frame.appearance.default')).toBe('frame')
    expect(configGroup('sys:captcha')).toBe('sys')
    expect(configGroup('plain')).toBe('plain')
  })
})
