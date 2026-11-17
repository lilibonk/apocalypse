import { describe, expect, it } from 'vitest'

import {
  configGroup,
  conflictedIds,
  editDraft,
  inferConfigControl,
  rebaseDraft,
  resolveConfigGroupMeta,
  resolveConflictUseMine,
  resolveConflictUseServer,
  saveItems,
  undoDraft,
} from './config-draft.model'
import type { ConfigRow } from './config.api'

const row = (id: string, value: string | null, version = 0, key = `frame.${id}`): ConfigRow => ({
  id,
  configKey: key,
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

  it('detects rows changed elsewhere, rebases onto latest server baseline while keeping 3-way history, and resolves conflicts', () => {
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
      conflictBaseValue: 'light',
      conflictServerValue: 'system',
      conflictServerVersion: 2,
    })
    const adoptedMine = resolveConflictUseMine(draft, 'a', latest[0])
    expect(adoptedMine.a).toEqual({
      value: 'dark',
      baseValue: 'system',
      baseVersion: 2,
      configKey: 'frame.a',
      configName: 'a',
    })
    expect(resolveConflictUseServer(rebased, 'a')).toEqual({})
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
    expect(rebased.later.conflictBaseValue).toBe('before')
    expect(rebased.later.conflictServerValue).toBe('elsewhere')
    expect(saveItems(rebased)).toEqual([
      { id: 'one', configValue: 'changed', expectedVersion: 4 },
      { id: 'later', configValue: 'after', expectedVersion: 13 },
    ])
    expect(undoDraft(rebased, 'later')).toEqual({ one: draft.one })
  })

  it('groups keys by their first segment and resolves 2-level semantic groups and control types', () => {
    expect(configGroup('frame.appearance.default')).toBe('frame')
    expect(configGroup('sys:captcha')).toBe('sys')
    expect(configGroup('plain')).toBe('plain')

    expect(resolveConfigGroupMeta('sys.user.initPassword')).toEqual({
      key: 'sys.user',
      label: '用户管理',
    })
    expect(resolveConfigGroupMeta('sys.account.registerUser')).toEqual({
      key: 'sys.account',
      label: '账号自助',
    })
    expect(resolveConfigGroupMeta('sys.index.skinName')).toEqual({
      key: 'sys.index',
      label: '主框架',
    })
    expect(resolveConfigGroupMeta('sys.security.lockThreshold')).toEqual({
      key: 'sys.security',
      label: '安全策略',
    })
    expect(resolveConfigGroupMeta('demo.feature.flag')).toEqual({
      key: 'demo',
      label: '演示参数',
    })

    expect(inferConfigControl(row('p', '123456', 0, 'sys.user.initPassword')).kind).toBe('secret')
    expect(inferConfigControl(row('b', 'true', 0, 'sys.account.registerUser')).kind).toBe('boolean')
    expect(inferConfigControl(row('t', 'dark', 0, 'sys.index.skinMode')).kind).toBe('enum')
    expect(inferConfigControl(row('theme', 'light', 0, 'frame.theme')).kind).toBe('text')
  })
})
