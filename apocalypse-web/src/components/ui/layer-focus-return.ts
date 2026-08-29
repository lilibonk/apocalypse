import { useEffect, useRef } from 'react'

let latestInteractionTarget: HTMLElement | null = null
let trackingInstalled = false

function installInteractionTracking() {
  if (trackingInstalled || typeof document === 'undefined') return

  const rememberTarget = (target: EventTarget | null) => {
    if (target instanceof HTMLElement) latestInteractionTarget = target
  }

  document.addEventListener('pointerdown', (event) => rememberTarget(event.target), true)
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') rememberTarget(document.activeElement)
    },
    true,
  )
  trackingInstalled = true
}

/** Controlled Radix layers opened outside a Trigger still return focus to the invoking control. */
export function useLayerFocusReturn(
  onOpenAutoFocus?: (event: Event) => void,
  onCloseAutoFocus?: (event: Event) => void,
) {
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(installInteractionTracking, [])

  const handleOpenAutoFocus = (event: Event) => {
    const activeElement = document.activeElement
    returnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : latestInteractionTarget
    onOpenAutoFocus?.(event)
  }

  const handleCloseAutoFocus = (event: Event) => {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented) return

    const returnTarget = returnFocusRef.current
    returnFocusRef.current = null
    if (!returnTarget?.isConnected) return

    event.preventDefault()
    returnTarget.focus({ preventScroll: true })
  }

  return { handleCloseAutoFocus, handleOpenAutoFocus }
}
