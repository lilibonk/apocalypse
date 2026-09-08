/** Canvas.focus() after a prevented pointer event must not inherit keyboard focus styling. */
export function trackFocusOrigin(canvas: HTMLElement, keyboardTarget: EventTarget) {
  const capture = { capture: true }
  const onPointer = () => {
    canvas.dataset.focusOrigin = 'pointer'
  }
  const onKeyboard = (event: Event) => {
    if (
      'key' in event &&
      typeof event.key === 'string' &&
      !['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)
    ) {
      canvas.dataset.focusOrigin = 'keyboard'
    }
  }
  canvas.addEventListener('pointerdown', onPointer, capture)
  keyboardTarget.addEventListener('keydown', onKeyboard, capture)
  return () => {
    canvas.removeEventListener('pointerdown', onPointer, capture)
    keyboardTarget.removeEventListener('keydown', onKeyboard, capture)
    delete canvas.dataset.focusOrigin
  }
}
