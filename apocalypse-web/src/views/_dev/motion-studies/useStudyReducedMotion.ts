import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(query).matches
}

/** Motion 13's hook samples the initial value; the study also observes live OS changes. */
export function useStudyReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
