/**
 * Vite 动态 chunk 预加载失败自愈（发版后旧 hash chunk 404）。
 * 每个路径最多自动重载一次，防止资源真实缺失时陷入刷新死循环。
 */

const STORAGE_KEY = 'apoc:preload-reload-path'

export interface PreloadRecoveryTarget {
  addEventListener: Window['addEventListener']
  removeEventListener: Window['removeEventListener']
  location: { pathname: string; search: string; reload: () => void }
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

export function attemptPreloadRecovery(
  target: Pick<PreloadRecoveryTarget, 'location' | 'sessionStorage'>,
): boolean {
  const currentRoute = `${target.location.pathname}${target.location.search}`
  try {
    const previous = target.sessionStorage?.getItem(STORAGE_KEY)
    if (previous === currentRoute) {
      return false
    }
    target.sessionStorage?.setItem(STORAGE_KEY, currentRoute)
  } catch {
    return false
  }
  target.location.reload()
  return true
}

export function clearPreloadRecoveryMark(
  storage: Pick<Storage, 'removeItem'> | undefined = typeof window !== 'undefined'
    ? window.sessionStorage
    : undefined,
): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    /* Ignore storage access restrictions. */
  }
}

export function installPreloadRecovery(
  target: PreloadRecoveryTarget = typeof window !== 'undefined' ? window : (undefined as never),
): () => void {
  if (!target) return () => {}
  const handler = (event: Event) => {
    if (attemptPreloadRecovery(target)) {
      event.preventDefault()
    }
  }
  target.addEventListener('vite:preloadError', handler)
  return () => target.removeEventListener('vite:preloadError', handler)
}
