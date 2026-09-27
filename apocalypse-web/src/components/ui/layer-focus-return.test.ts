import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useEffect: (effect: () => void) => effect(),
  useRef: <T>(current: T) => ({ current }),
}))

class TestElement extends EventTarget {
  control: TestControl | null = null
  blocked = false

  closest(selector: string) {
    if (selector === '[inert], [hidden]') return this.blocked ? this : null
    return this.control
  }
}

class TestControl extends TestElement {
  isConnected = true
  disabled = false
  focus = vi.fn()

  constructor() {
    super()
    this.control = this
  }

  matches() {
    return this.disabled
  }
}

/** Deliberately no click-to-focus behavior: matches the Safari case this hook must handle. */
class TestDocument {
  body = new TestControl()
  activeElement = this.body
  listeners = new Map<string, Array<(event: Event) => void>>()

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  emit(type: string, target: TestElement, key?: string) {
    const event = { target, key } as unknown as Event
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

let documentStub: TestDocument
let now: number
let useLayerFocusReturn: typeof import('./layer-focus-return').useLayerFocusReturn

beforeEach(async () => {
  vi.resetModules()
  documentStub = new TestDocument()
  now = 0
  vi.stubGlobal('Element', TestElement)
  vi.stubGlobal('HTMLElement', TestControl)
  vi.stubGlobal('document', documentStub)
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  ;({ useLayerFocusReturn } = await import('./layer-focus-return'))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const event = () => new Event('autofocus', { cancelable: true })

describe('controlled layer focus return', () => {
  it('returns to a pointer-activated control even when Safari keeps an older input focused', () => {
    const oldInput = new TestControl()
    const trigger = new TestControl()
    documentStub.activeElement = oldInput
    const handlers = useLayerFocusReturn()
    documentStub.emit('pointerdown', trigger)
    documentStub.emit('click', trigger)
    handlers.handleOpenAutoFocus(event())
    const close = event()
    handlers.handleCloseAutoFocus(close)
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(oldInput.focus).not.toHaveBeenCalled()
    expect(close.defaultPrevented).toBe(true)
  })

  it('resolves an SVG descendant to its invoking button', () => {
    const trigger = new TestControl()
    const icon = new TestElement()
    icon.control = trigger
    const handlers = useLayerFocusReturn()
    documentStub.emit('click', icon)
    handlers.handleOpenAutoFocus(event())
    handlers.handleCloseAutoFocus(event())
    expect(trigger.focus).toHaveBeenCalledOnce()
  })

  it.each(['Enter', ' '])('retains keyboard activation with %s', (key) => {
    const trigger = new TestControl()
    documentStub.activeElement = trigger
    const handlers = useLayerFocusReturn()
    documentStub.emit('keydown', trigger, key)
    handlers.handleOpenAutoFocus(event())
    handlers.handleCloseAutoFocus(event())
    expect(trigger.focus).toHaveBeenCalledOnce()
  })

  it('refreshes activation on click after a long pointer hold', () => {
    const trigger = new TestControl()
    const handlers = useLayerFocusReturn()
    documentStub.emit('pointerdown', trigger)
    now = 2500
    documentStub.emit('click', trigger)
    handlers.handleOpenAutoFocus(event())
    handlers.handleCloseAutoFocus(event())
    expect(trigger.focus).toHaveBeenCalledOnce()
  })

  it('ignores expired activations for a later programmatic opening', () => {
    const trigger = new TestControl()
    const active = new TestControl()
    const handlers = useLayerFocusReturn()
    documentStub.emit('click', trigger)
    now = 2500
    documentStub.activeElement = active
    handlers.handleOpenAutoFocus(event())
    handlers.handleCloseAutoFocus(event())
    expect(trigger.focus).not.toHaveBeenCalled()
    expect(active.focus).toHaveBeenCalledOnce()
  })

  it('consumes activation only once instead of reusing it for another layer', () => {
    const trigger = new TestControl()
    const nextActive = new TestControl()
    const first = useLayerFocusReturn()
    const second = useLayerFocusReturn()
    documentStub.emit('click', trigger)
    first.handleOpenAutoFocus(event())
    documentStub.activeElement = nextActive
    second.handleOpenAutoFocus(event())
    second.handleCloseAutoFocus(event())
    expect(nextActive.focus).toHaveBeenCalledOnce()
    expect(trigger.focus).not.toHaveBeenCalled()
  })

  it('does not reuse a recent click after Tab navigation and a command shortcut', () => {
    const clicked = new TestControl()
    const keyboardTarget = new TestControl()
    const handlers = useLayerFocusReturn()
    documentStub.emit('click', clicked)
    now = 100
    documentStub.emit('keydown', clicked, 'Tab')
    documentStub.activeElement = keyboardTarget
    documentStub.emit('focusin', keyboardTarget)
    documentStub.emit('keydown', keyboardTarget, 'k')
    handlers.handleOpenAutoFocus(event())
    handlers.handleCloseAutoFocus(event())
    expect(keyboardTarget.focus).toHaveBeenCalledOnce()
    expect(clicked.focus).not.toHaveBeenCalled()
  })

  it('drops a pointer activation when focus moves to a different control', () => {
    const clicked = new TestControl()
    const focused = new TestControl()
    const handlers = useLayerFocusReturn()
    documentStub.emit('click', clicked)
    documentStub.activeElement = focused
    documentStub.emit('focusin', focused)
    handlers.handleOpenAutoFocus(event())
    handlers.handleCloseAutoFocus(event())
    expect(focused.focus).toHaveBeenCalledOnce()
    expect(clicked.focus).not.toHaveBeenCalled()
  })

  it.each(['disconnected', 'disabled', 'hidden'] as const)(
    'uses a safe previous focus when the trigger becomes %s',
    (failure) => {
      const trigger = new TestControl()
      const previous = new TestControl()
      documentStub.activeElement = previous
      const handlers = useLayerFocusReturn()
      documentStub.emit('click', trigger)
      handlers.handleOpenAutoFocus(event())
      if (failure === 'disconnected') trigger.isConnected = false
      if (failure === 'disabled') trigger.disabled = true
      if (failure === 'hidden') trigger.blocked = true
      handlers.handleCloseAutoFocus(event())
      expect(trigger.focus).not.toHaveBeenCalled()
      expect(previous.focus).toHaveBeenCalledOnce()
    },
  )

  it('leaves Radix default behavior intact when no recorded target is valid', () => {
    const trigger = new TestControl()
    const handlers = useLayerFocusReturn()
    documentStub.emit('click', trigger)
    handlers.handleOpenAutoFocus(event())
    trigger.isConnected = false
    const close = event()
    handlers.handleCloseAutoFocus(close)
    expect(close.defaultPrevented).toBe(false)
    expect(trigger.focus).not.toHaveBeenCalled()
  })

  it('respects a caller that explicitly handles close autofocus', () => {
    const trigger = new TestControl()
    const handlers = useLayerFocusReturn(undefined, (close) => close.preventDefault())
    documentStub.emit('click', trigger)
    handlers.handleOpenAutoFocus(event())
    handlers.handleCloseAutoFocus(event())
    expect(trigger.focus).not.toHaveBeenCalled()
  })
})
