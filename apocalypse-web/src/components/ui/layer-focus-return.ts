import { useEffect, useRef } from 'react'

interface LayerActivation {
  target: HTMLElement
  capturedAt: number
}

// Controlled layers open in the activation event or its next render. Old interactions
// must not redirect focus when a layer opens later without a user activation.
const ACTIVATION_MAX_AGE_MS = 1000
const FOCUS_TARGET = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
let latestActivation: LayerActivation | null = null
let trackingInstalled = false

function canRestoreFocus(target: HTMLElement | null): target is HTMLElement {
  return !!(
    target?.isConnected &&
    !target.matches(':disabled, [aria-disabled="true"]') &&
    !target.closest('[inert], [hidden]')
  )
}

function installInteractionTracking() {
  if (trackingInstalled || typeof document === 'undefined') return

  const rememberTarget = (target: EventTarget | null) => {
    // Safari does not focus buttons on pointer clicks. Resolve SVG/icon descendants
    // to their actual control rather than relying on document.activeElement.
    const control = target instanceof Element ? target.closest(FOCUS_TARGET) : null
    latestActivation =
      control instanceof HTMLElement && canRestoreFocus(control)
        ? { target: control, capturedAt: performance.now() }
        : null
  }

  document.addEventListener('pointerdown', (event) => rememberTarget(event.target), true)
  document.addEventListener('click', (event) => rememberTarget(event.target), true)
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') rememberTarget(document.activeElement)
      else latestActivation = null
    },
    true,
  )
  document.addEventListener(
    'focusin',
    (event) => {
      if (latestActivation && event.target !== latestActivation.target) latestActivation = null
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
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(installInteractionTracking, [])

  const handleOpenAutoFocus = (event: Event) => {
    const activeElement = document.activeElement
    previousFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null
    const activation = latestActivation
    latestActivation = null
    returnFocusRef.current =
      activation &&
      performance.now() - activation.capturedAt <= ACTIVATION_MAX_AGE_MS &&
      canRestoreFocus(activation.target)
        ? activation.target
        : previousFocusRef.current
    onOpenAutoFocus?.(event)
  }

  const handleCloseAutoFocus = (event: Event) => {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented) return

    const returnTarget = canRestoreFocus(returnFocusRef.current)
      ? returnFocusRef.current
      : previousFocusRef.current
    returnFocusRef.current = null
    previousFocusRef.current = null
    if (!canRestoreFocus(returnTarget)) return

    event.preventDefault()
    returnTarget.focus({ preventScroll: true })
  }

  return { handleCloseAutoFocus, handleOpenAutoFocus }
}
