import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_SESSION_LOCK,
  supportsBrowserSessionLock,
  subscribeBrowserSessionRestore,
  withBrowserSessionLock,
} from './browser-session'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('browser cookie session exclusion', () => {
  it('holds the same exclusive Web Lock until CSRF, rotation and me complete', async () => {
    const events: string[] = []
    let finish!: () => void
    const ready = new Promise<void>((done) => {
      finish = done
    })
    const request = vi.fn(async (name: string, task: () => Promise<unknown>) => {
      events.push(`${name}:enter`)
      try {
        return await task()
      } finally {
        events.push('released')
      }
    })
    vi.stubGlobal('navigator', { locks: { request } })
    const run = withBrowserSessionLock(async () => {
      events.push('csrf', 'refresh')
      await ready
      events.push('me')
      return true
    })
    expect(supportsBrowserSessionLock()).toBe(true)
    expect(events).toEqual([`${BROWSER_SESSION_LOCK}:enter`, 'csrf', 'refresh'])
    finish()
    expect(await run).toBe(true)
    expect(events.at(-2)).toBe('me')
    expect(events.at(-1)).toBe('released')
  })
  it('detects unsupported lock APIs so store can avoid rotating a shared cookie', () => {
    vi.stubGlobal('navigator', {})
    expect(supportsBrowserSessionLock()).toBe(false)
  })
})

describe('restored browser session revalidation', () => {
  function surfaces(visibilityState = 'visible') {
    const windowEvents = new EventTarget()
    const documentEvents = Object.assign(new EventTarget(), { visibilityState })
    vi.stubGlobal('window', windowEvents)
    vi.stubGlobal('document', documentEvents)
    return { windowEvents, documentEvents }
  }

  it('coalesces focus/visible/restored pageshow and retains a bounded trailing event', () => {
    vi.useFakeTimers()
    const { windowEvents, documentEvents } = surfaces()
    const revalidate = vi.fn()
    const stop = subscribeBrowserSessionRestore(revalidate)
    windowEvents.dispatchEvent(new Event('focus'))
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    windowEvents.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
    vi.advanceTimersByTime(100)
    expect(revalidate).toHaveBeenCalledOnce()
    windowEvents.dispatchEvent(new Event('focus'))
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(999)
    expect(revalidate).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    expect(revalidate).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(10_000)
    expect(revalidate).toHaveBeenCalledTimes(2)
    stop()
  })

  it('ignores hidden visibility and ordinary pageshow, and cancels a pending event on stop', () => {
    vi.useFakeTimers()
    const { windowEvents, documentEvents } = surfaces('hidden')
    const revalidate = vi.fn()
    const stop = subscribeBrowserSessionRestore(revalidate)
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    windowEvents.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }))
    vi.advanceTimersByTime(1000)
    expect(revalidate).not.toHaveBeenCalled()
    windowEvents.dispatchEvent(new Event('focus'))
    stop()
    vi.advanceTimersByTime(1000)
    windowEvents.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
    vi.advanceTimersByTime(1000)
    expect(revalidate).not.toHaveBeenCalled()
  })
})
