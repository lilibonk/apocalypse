import { normalizeTabKey } from '@/stores/tabs'

/** Called only after /me has loaded. Returns whether the current route needs a notified redirect. */
export function reconcileMenuAccess(
  allowedPaths: string[],
  pathname: string,
  retainAllowed: (paths: string[]) => void,
): boolean {
  retainAllowed(allowedPaths)
  const currentPath = normalizeTabKey(pathname)
  return currentPath !== '/' && !allowedPaths.includes(currentPath)
}
