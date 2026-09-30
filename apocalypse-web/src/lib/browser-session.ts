/** One same-origin lock covers CSRF, cookie rotation and the confirming /me snapshot. */
export const BROWSER_SESSION_LOCK = 'apocalypse.browser-session'

export function supportsBrowserSessionLock(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function'
}

export async function withBrowserSessionLock<T>(task: () => Promise<T>): Promise<T> {
  if (!supportsBrowserSessionLock()) return task() // Explicit login/logout only in this fallback.
  return navigator.locks.request(BROWSER_SESSION_LOCK, task)
}

let channel: BroadcastChannel | undefined
function sessionChannel(): BroadcastChannel | undefined {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return undefined
  channel ??= new BroadcastChannel('apocalypse.browser-session')
  return channel
}

/** The signal contains no identity, cookie or credential data. */
export function publishBrowserSessionChange(): void {
  sessionChannel()?.postMessage({ type: 'session-changed' })
}

export function subscribeBrowserSessionChange(listener: () => void): () => void {
  const current = sessionChannel()
  if (!current) return () => {}
  const receive = (event: MessageEvent<unknown>) => {
    if (
      event.data &&
      typeof event.data === 'object' &&
      'type' in event.data &&
      event.data.type === 'session-changed'
    )
      listener()
  }
  current.addEventListener('message', receive)
  return () => current.removeEventListener('message', receive)
}

/** Re-read the shared cookie after restoration, coalescing focus/visibility/BFCache bursts. */
export function subscribeBrowserSessionRestore(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  let scheduled: ReturnType<typeof setTimeout> | undefined
  let lastStarted = 0
  const schedule = () => {
    if (scheduled !== undefined) return
    // There is no polling: one trailing event is retained, with at most one start per second.
    scheduled = setTimeout(
      () => {
        scheduled = undefined
        lastStarted = Date.now()
        listener()
      },
      Math.max(100, 1000 - (Date.now() - lastStarted)),
    )
  }
  const visibility = () => {
    if (document.visibilityState === 'visible') schedule()
  }
  const pageshow = (event: PageTransitionEvent) => {
    if (event.persisted) schedule()
  }
  window.addEventListener('focus', schedule)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pageshow', pageshow)
  return () => {
    if (scheduled !== undefined) clearTimeout(scheduled)
    window.removeEventListener('focus', schedule)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('pageshow', pageshow)
  }
}
