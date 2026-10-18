import { useSyncExternalStore } from 'react'

// Keep the existing mobile navigation boundary; these desktop surfaces do not redesign mobile.
const desktopQuery = '(min-width: 768px)'

function subscribe(change: () => void) {
  const media = window.matchMedia(desktopQuery)
  media.addEventListener('change', change)
  return () => media.removeEventListener('change', change)
}

function getSnapshot() {
  return window.matchMedia(desktopQuery).matches
}

export function useDesktopViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
