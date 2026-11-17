import { describe, expect, it } from 'vitest'

import { resolveDictBadgeVariant } from './DictTag'

describe('DictTag semantic tone resolution', () => {
  it('prioritizes persisted D2 tagTone from DictData when present', () => {
    expect(resolveDictBadgeVariant('custom_type', 'A', 'BRAND')).toBe('default')
    expect(resolveDictBadgeVariant('custom_type', 'B', 'INFO')).toBe('info')
    expect(resolveDictBadgeVariant('custom_type', 'C', 'SUCCESS')).toBe('success')
    expect(resolveDictBadgeVariant('custom_type', 'D', 'WARNING')).toBe('warning')
    expect(resolveDictBadgeVariant('custom_type', 'E', 'DANGER')).toBe('destructive')
  })

  it('falls back to deterministic semantics when tagTone is NEUTRAL or absent', () => {
    expect(resolveDictBadgeVariant('sys_user_status', '1', 'NEUTRAL')).toBe('success')
    expect(resolveDictBadgeVariant('sys_user_status', '0', null)).toBe('warning')
    expect(resolveDictBadgeVariant('sys_common_status', '0', undefined)).toBe('destructive')
    expect(resolveDictBadgeVariant('sys_user_sex', '1', null)).toBe('default')
    expect(resolveDictBadgeVariant('sys_user_sex', '2', null)).toBe('info')
    expect(resolveDictBadgeVariant('custom_type', 'X', 'NEUTRAL')).toBe('secondary')
  })
})
