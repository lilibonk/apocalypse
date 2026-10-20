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
    expect(draft.a).toEqual({
      value: 'dark',
      baseValue: 'light',
      baseVersion: 0,
      configKey: 'frame.a',
      configName: 'a',
    })
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
    expect(rebased.a).toEqual({
      value: 'dark',
      baseValue: 'system',
      baseVersion: 2,
      configKey: 'frame.a',
      configName: 'a',
    })
    expect(rebaseDraft(draft, [row('a', 'dark', 2)])).toEqual({})
  })

  it('keeps named review context and independent baselines when edits span pages', () => {
    const firstPage = row('one', 'first', 4)
    const laterPage = row('later', 'before', 12)
    const draft = editDraft(editDraft({}, firstPage, 'changed'), laterPage, 'after')
    expect(draft.one.configKey).toBe('frame.one')
    expect(draft.later.configName).toBe('later')
    const rebased = rebaseDraft(draft, [row('later', 'elsewhere', 13)])
    expect(rebased.one).toEqual(draft.one)
    expect(rebased.later.baseValue).toBe('elsewhere')
    expect(saveItems(rebased)).toEqual([
      { id: 'one', configValue: 'changed', expectedVersion: 4 },
      { id: 'later', configValue: 'after', expectedVersion: 13 },
    ])
    expect(undoDraft(rebased, 'later')).toEqual({ one: draft.one })
  })

  it('groups keys by their first segment', () => {
    expect(configGroup('frame.appearance.default')).toBe('frame')
    expect(configGroup('sys:captcha')).toBe('sys')
    expect(configGroup('plain')).toBe('plain')
  })
})
