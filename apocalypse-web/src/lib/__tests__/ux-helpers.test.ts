import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  copyTextToClipboard,
  dedupeLiveAnnouncement,
  resetLiveAnnouncementForTests,
} from '../clipboard'
import { formatModShortcut, isApplePlatform } from '../platform'

describe('clipboard and platform shortcut helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetLiveAnnouncementForTests()
  })

  it('copies text via navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    expect(await copyTextToClipboard('')).toBe(false)
    expect(writeText).not.toHaveBeenCalled()

    expect(await copyTextToClipboard('alice')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('alice')
  })

  it('falls back to execCommand when clipboard API rejects and returns false if both fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'))
    const select = vi.fn()
    const setSelectionRange = vi.fn()
    const remove = vi.fn()
    const fakeTextarea = {
      value: '',
      readOnly: false,
      style: {} as CSSStyleDeclaration,
      setAttribute: vi.fn(),
      select,
      setSelectionRange,
      remove,
    }
    const execCommand = vi.fn().mockReturnValue(true)

    vi.stubGlobal('HTMLElement', class {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('document', {
      activeElement: null,
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => fakeTextarea),
      execCommand,
    })

    expect(await copyTextToClipboard('fallback-value')).toBe(true)
    expect(select).toHaveBeenCalledTimes(1)
    expect(setSelectionRange).toHaveBeenCalledWith(0, 'fallback-value'.length)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(remove).toHaveBeenCalledTimes(1)

    execCommand.mockReturnValue(false)
    expect(await copyTextToClipboard('still-fails')).toBe(false)
  })

  it('alternates trailing NBSP so repeated live-region messages still announce', () => {
    resetLiveAnnouncementForTests()
    expect(dedupeLiveAnnouncement('已复制')).toBe('已复制')
    expect(dedupeLiveAnnouncement('已复制')).toBe('已复制\u00A0')
    expect(dedupeLiveAnnouncement('已复制')).toBe('已复制')
    expect(dedupeLiveAnnouncement('复制失败')).toBe('复制失败')
  })

  it('formats modifier shortcuts for Apple vs non-Apple platforms', () => {
    expect(isApplePlatform('MacIntel')).toBe(true)
    expect(isApplePlatform('iPhone')).toBe(true)
    expect(isApplePlatform('Win32')).toBe(false)
    expect(isApplePlatform('Linux x86_64')).toBe(false)

    expect(formatModShortcut('k', true)).toBe('⌘K')
    expect(formatModShortcut('s', false)).toBe('Ctrl+S')
  })
})
