import { describe, expect, it } from 'vitest'

import {
  createRoleMemberDraft,
  resetRoleMemberDraft,
  roleMemberChanges,
  roleMemberLinkState,
  toggleRoleMember,
  undoRoleMember,
  unreadRoleMemberIds,
  validRoleMemberPage,
} from './role-member-draft.model'

const visibleId = '9223372036854775801'
const hiddenId = '9223372036854775802'
const laterPageId = '9223372036854775803'
const newId = '9223372036854775804'

describe('complete role member replacement draft', () => {
  it('preserves every original ID while editing a single visible relationship', () => {
    const initial = createRoleMemberDraft([visibleId, hiddenId, laterPageId])
    const changed = toggleRoleMember(toggleRoleMember(initial, visibleId), newId)
    expect([...changed.selected]).toEqual([hiddenId, laterPageId, newId])
    expect(roleMemberChanges(changed)).toEqual({ added: [newId], removed: [visibleId] })
    expect([...initial.selected]).toEqual([visibleId, hiddenId, laterPageId])
    expect([...changed.baseline]).toEqual([visibleId, hiddenId, laterPageId])
    expect(roleMemberLinkState(changed, hiddenId)).toBe('linked')
    expect(roleMemberLinkState(changed, newId)).toBe('added')
    expect(roleMemberLinkState(changed, visibleId)).toBe('removed')
  })

  it('captures IDs by value and never combines adjacent snowflakes through numeric conversion', () => {
    const raw = [visibleId, hiddenId, visibleId]
    const draft = createRoleMemberDraft(raw)
    raw.splice(0, raw.length, newId)
    expect([...draft.baseline]).toEqual([visibleId, hiddenId])
    expect([...draft.selected]).toEqual([visibleId, hiddenId])
    expect(draft.baseline).not.toBe(draft.selected)
  })

  it('restores an individual relation without discarding other pending changes', () => {
    const initial = createRoleMemberDraft([visibleId, hiddenId])
    const changed = toggleRoleMember(toggleRoleMember(initial, hiddenId), newId)
    const restoredHidden = undoRoleMember(changed, hiddenId)
    expect(roleMemberChanges(restoredHidden)).toEqual({ added: [newId], removed: [] })
    const restoredNew = undoRoleMember(changed, newId)
    expect(roleMemberChanges(restoredNew)).toEqual({ added: [], removed: [hiddenId] })
    expect(roleMemberLinkState(restoredNew, newId)).toBe('unlinked')
    expect(roleMemberChanges(changed)).toEqual({ added: [newId], removed: [hiddenId] })
  })

  it('keeps unread profiles discoverable even when their relationship is pending removal', () => {
    const initial = createRoleMemberDraft([visibleId, hiddenId, laterPageId])
    const changed = toggleRoleMember(toggleRoleMember(initial, hiddenId), newId)
    const profiles = new Map([
      [visibleId, { id: visibleId, username: 'visible', nickname: null, status: 1 }],
      [newId, { id: newId, username: 'new', nickname: null, status: 1 }],
    ])
    expect(unreadRoleMemberIds(changed, profiles)).toEqual([hiddenId, laterPageId])
    expect(changed.selected.has(laterPageId)).toBe(true)
    expect(changed.selected.has(hiddenId)).toBe(false)
    expect(unreadRoleMemberIds(changed, new Map())).toEqual([
      visibleId,
      hiddenId,
      laterPageId,
      newId,
    ])
  })

  it('resets to the complete baseline including IDs absent from all fetched profile pages', () => {
    const initial = createRoleMemberDraft([visibleId, hiddenId, laterPageId])
    const changed = toggleRoleMember(toggleRoleMember(initial, hiddenId), newId)
    const reset = resetRoleMemberDraft(changed)
    expect([...reset.selected]).toEqual([visibleId, hiddenId, laterPageId])
    expect(roleMemberChanges(reset)).toEqual({ added: [], removed: [] })
    expect([...changed.selected]).toEqual([visibleId, laterPageId, newId])
  })

  it('returns to a valid server page after removals empty the final page', () => {
    expect(validRoleMemberPage(3, 8, 4)).toBe(2)
    expect(validRoleMemberPage(2, 0, 4)).toBe(1)
    expect(validRoleMemberPage(0, 9, 4)).toBe(1)
    expect(validRoleMemberPage(3, 9, 4)).toBe(3)
  })
})
