import { useSyncExternalStore } from 'react'

import { useSettings } from '@/stores/settings'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(reducedMotionQuery).matches
}

/** Observe both the product animation switch and live changes to the OS preference. */
export function useMotionPreference(): boolean {
  const { motionEnabled } = useSettings()
  const reduced = useSyncExternalStore(subscribe, getSnapshot, () => false)
  return motionEnabled && !reduced
}
