import { Plane, Raycaster, Triangle, Vector2, Vector3 } from 'three/webgpu'

import type { OrbState } from '@/effects/PixelOrb/types'

import { readSlimeColours, SLIME_RECIPE } from './appearance'
import { SlimeGestures } from './gestures'
import type { Reaction } from './face-motion'
import { trackFocusOrigin } from './focus'
import { summarizeFrames, type FrameReport } from './performance'
import { JellyPhysics, type JellyConfig } from './physics'
import { createSlimeScene, type SlimeScene } from './scene'
import { frontSurfaceZ } from './shape'
import { createStrictGpuSession, type StrictGpuSession } from './strict-renderer'

export interface SlimeRuntimeInfo {
  backend: 'webgpu'
  adapter: string
  userAgent: string
  dpr: number
  width: number
  height: number
}

export interface SlimeRuntimeOptions {
  signal: AbortSignal
  state?: OrbState
  interactive?: boolean
  gaze?: boolean
  onReady?: (info: SlimeRuntimeInfo) => void
  onFailure?: (reason: 'unsupported' | 'failed' | 'lost') => void
  onFrame?: (
    report: FrameReport,
    physics: JellyPhysics['diagnostics'],
    ambient: {
      gazeX: number
      gazeY: number
      bubbleY: number
      expression: string
      stars: boolean
      entering: boolean
      time: number
    },
  ) => void
}

export interface SlimeRuntime {
  startEntry: () => void
  react: (kind: Reaction) => void
  reset: () => void
  setConfig: (config: Partial<JellyConfig>) => void
  setState: (state: OrbState) => void
  setStatic: (value: boolean) => void
  poke: () => void
  suspend: (value: boolean) => void
  holdPressure: (value: boolean) => void
  startBenchmark: () => void
  getBenchmark: () => { phase: string; report: FrameReport; info: SlimeRuntimeInfo }
  exportPoster: () => string
  simulateDeviceLoss: () => void
  dispose: () => void
}

/** No app/global state is exposed on window. The acceptance page consumes this local handle. */
export async function createSlimeRuntime(
  canvas: HTMLCanvasElement,
  options: SlimeRuntimeOptions,
): Promise<SlimeRuntime> {
  let session: StrictGpuSession | undefined
  let scene: SlimeScene | undefined
  let disposed = false
  let frame = 0
  let previousTime = 0
  let staticMode = false
  let externallySuspended = false
  let lastReport = 0
  let state = options.state ?? 'idle'
  const physics = new JellyPhysics()
  const gestures = new SlimeGestures()
  let time = 0
  let clock = 0
  let benchmarkCycle = -1
  let benchmarkHeld = false
  let pointerId: number | null = null
  const recentFrames: number[] = []
  let benchmarkStarted = 0
  let benchmarkPhase = 'idle'
  let benchmarkFrames: number[] = []
  let benchmarkElapsedMs = 0
  let info: SlimeRuntimeInfo
  let benchmarkInfo: SlimeRuntimeInfo | undefined
  const cleanups: (() => void)[] = []

  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    physics.endGrab()
    gestures.cancel()
    cleanups.forEach((cleanup) => cleanup())
    scene?.dispose()
    session?.dispose()
  }
  options.signal.addEventListener('abort', dispose, { once: true })
  cleanups.push(() => options.signal.removeEventListener('abort', dispose))

  const fail = (reason: 'unsupported' | 'failed' | 'lost') => {
    if (disposed || options.signal.aborted) return
    dispose()
    options.onFailure?.(reason)
  }

  try {
    if (!navigator.gpu) throw new Error('WebGPU unavailable')
    session = await createStrictGpuSession(canvas, options.signal)
    if (disposed || options.signal.aborted) {
      session.dispose()
      throw new DOMException('Slime initialization cancelled', 'AbortError')
    }
    options.signal.throwIfAborted()
    const initialTheme = document.documentElement.className
    scene = createSlimeScene(session.renderer, readSlimeColours(canvas), physics)
    const view = scene
    const gpu = session
    const a = new Vector3()
    const b = new Vector3()
    const c = new Vector3()
    const weights = new Vector3()
    const local = new Vector3()
    const face = view.faceMotion
    physics.onLand = () => {
      if (gestures.land(clock) && state === 'idle') face.react('dizzy')
    }
    physics.onEntryComplete = () => {
      if (state === 'idle') face.react('happy')
    }
    const updateSkin = () => view.update(staticMode ? 0 : time, state)
    const draw = () => {
      if (disposed) return
      updateSkin()
      gpu.renderer.render(view.scene, view.camera)
    }

    const anchor =
      canvas.closest('.slime-mascot, .slime-preview-anchor') ?? canvas.parentElement ?? canvas
    const stage = canvas.closest('.brand-slime-stage') ?? anchor
    const resize = () => {
      const rect = anchor.getBoundingClientRect()
      const { width, height } = rect
      if (width < 1 || height < 1 || disposed) return
      const bounds = stage.getBoundingClientRect()
      const left = Math.max(0, rect.left - bounds.left)
      const top = Math.max(0, rect.top - bounds.top)
      const right = Math.max(0, bounds.right - rect.right)
      const bottom = Math.max(0, bounds.bottom - rect.bottom)
      const canvasWidth = width + left + right
      const canvasHeight = height + top + bottom
      // Overscan only the brand panel: never cover the adjacent authentication form.
      Object.assign(canvas.style, {
        left: `${-left}px`,
        top: `${-top}px`,
        right: 'auto',
        bottom: 'auto',
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
      })
      const dpr = Math.min(window.devicePixelRatio || 1, SLIME_RECIPE.maxPixelRatio)
      gpu.renderer.setPixelRatio(dpr)
      gpu.renderer.setSize(Math.round(canvasWidth), Math.round(canvasHeight), false)
      view.resize(width, height, left, top, canvasWidth, canvasHeight)
      info = {
        backend: 'webgpu',
        adapter:
          [gpu.adapter.info.vendor, gpu.adapter.info.architecture, gpu.adapter.info.description]
            .filter(Boolean)
            .join(' / ') || 'Adapter information unavailable',
        userAgent: navigator.userAgent,
        dpr,
        width: canvas.width,
        height: canvas.height,
      }
      if (
        benchmarkStarted &&
        benchmarkPhase !== 'complete' &&
        benchmarkInfo &&
        (benchmarkInfo.width !== info.width ||
          benchmarkInfo.height !== info.height ||
          benchmarkInfo.dpr !== info.dpr)
      ) {
        benchmarkPhase = 'interrupted'
        benchmarkStarted = 0
        physics.endGrab()
      }
    }
    resize()
    updateSkin()
    await gpu.renderer.compileAsync(view.scene, view.camera)
    options.signal.throwIfAborted()

    const scriptedBenchmark = (now: number) => {
      if (!benchmarkStarted || benchmarkPhase === 'complete') return
      const elapsed = (now - benchmarkStarted) / 1000
      benchmarkPhase =
        elapsed < 10 ? 'warming-up' : benchmarkElapsedMs < 60000 ? 'measuring' : 'complete'
      if (benchmarkPhase === 'complete') {
        physics.endGrab()
        face.grab(false, false)
        return
      }
      const cycle = Math.floor(elapsed / 12)
      const phase = elapsed % 12
      if (cycle !== benchmarkCycle) {
        benchmarkCycle = cycle
        physics.reset()
        face.reset()
        gestures.cancel()
        benchmarkHeld = false
      }
      if (phase >= 3 && phase < 7.5) {
        if (!benchmarkHeld) {
          const point = { x: 0.25, y: 1.2, z: frontSurfaceZ(0.25, 1.2) }
          physics.beginGrab(point, point)
          face.grab(true)
          gestures.begin(320, 320, now, 640)
          benchmarkHeld = true
        }
        if (phase >= 5) {
          const dx = Math.sin(phase * 18) * 0.75
          physics.moveGrab({ x: 0.25 + dx, y: 2.3, z: frontSurfaceZ(0.25, 1.2) })
          gestures.move(320 + dx * 160, 220, now)
        }
      } else if (benchmarkHeld) {
        physics.endGrab()
        face.grab(false, false)
        gestures.release(now)
        benchmarkHeld = false
      }
    }
    const tick = (now: number) => {
      frame = 0
      if (disposed || document.hidden || externallySuspended || staticMode) return
      const interval = previousTime ? now - previousTime : 0
      previousTime = now
      clock = now
      scriptedBenchmark(now)
      if (interval > 0) {
        const dt = Math.min(interval / 1000, 0.1)
        time += dt
        physics.update(dt)
        if (gestures.update(now, physics.position.y) && state === 'idle') face.react('dizzy')
        recentFrames.push(interval)
        if (recentFrames.length > 180) recentFrames.shift()
        if (benchmarkPhase === 'measuring') {
          benchmarkFrames.push(interval)
          benchmarkElapsedMs += interval
        }
      }
      try {
        draw()
      } catch {
        fail('failed')
        return
      }
      if (now - lastReport > 500) {
        lastReport = now
        options.onFrame?.(summarizeFrames(recentFrames), physics.diagnostics, {
          gazeX: face.state.gazeX,
          gazeY: face.state.gazeY,
          bubbleY: view.bubbles.instanceMatrix.array[13] ?? 0,
          expression: state === 'idle' ? face.expression : state,
          stars: view.dizzyStars.visible,
          entering: physics.entering,
          time,
        })
      }
      frame = requestAnimationFrame(tick)
    }
    const resume = () => {
      previousTime = 0
      if (!disposed && !document.hidden && !externallySuspended && !staticMode && !frame) {
        frame = requestAnimationFrame(tick)
      }
    }
    const cancelInput = () => {
      physics.endGrab()
      face.grab(false, false)
      gestures.cancel()
      if (pointerId !== null && canvas.hasPointerCapture(pointerId))
        canvas.releasePointerCapture(pointerId)
      pointerId = null
    }
    const resetGaze = () => {
      face.lookAt(0, 0)
    }
    const onBlur = () => {
      cancelInput()
      resetGaze()
    }
    const suspend = (value: boolean) => {
      externallySuspended = value
      if (value) {
        cancelAnimationFrame(frame)
        frame = 0
        cancelInput()
        if (benchmarkStarted && benchmarkPhase !== 'complete') {
          benchmarkPhase = 'interrupted'
          benchmarkStarted = 0
        }
      } else resume()
    }
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
        cancelInput()
        if (benchmarkStarted && benchmarkPhase !== 'complete') {
          benchmarkPhase = 'interrupted'
          benchmarkStarted = 0
        }
      } else resume()
    }
    const onTheme = () => {
      if (disposed) return
      try {
        view.updateColours(readSlimeColours(canvas))
        if (!staticMode && state === 'idle') face.react('wink')
        if (staticMode) draw()
      } catch {
        fail('failed')
      }
    }
    const observer = new ResizeObserver(() => {
      resize()
      if (staticMode) draw()
    })
    observer.observe(anchor)
    if (stage !== anchor) observer.observe(stage)
    const themeObserver = new MutationObserver(onTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    if (document.documentElement.className !== initialTheme) onTheme()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    cleanups.push(() => {
      observer.disconnect()
      themeObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
    })

    if (options.interactive !== false) {
      cleanups.push(trackFocusOrigin(canvas, window))
      const raycaster = new Raycaster()
      const pointer = new Vector2()
      const grabPlane = new Plane()
      const grabbedAt = new Vector3()
      const movedTo = new Vector3()
      const setRay = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect()
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((event.clientY - rect.top) / rect.height) * 2,
        )
        raycaster.setFromCamera(pointer, view.camera)
      }
      const onDown = (event: PointerEvent) => {
        if (
          !event.isPrimary ||
          event.button !== 0 ||
          pointerId !== null ||
          staticMode ||
          state !== 'idle'
        )
          return
        setRay(event)
        const hit = raycaster.intersectObject(view.body, false)[0]
        if (!hit?.face) return
        event.preventDefault()
        canvas.focus({ preventScroll: true })
        pointerId = event.pointerId
        canvas.setPointerCapture(pointerId)
        grabbedAt.copy(hit.point)
        grabPlane.setFromNormalAndCoplanarPoint(view.camera.getWorldDirection(a), hit.point)
        local.copy(hit.point)
        view.actor.worldToLocal(local)
        const positions = view.body.geometry.getAttribute('position')
        a.fromBufferAttribute(positions, hit.face.a)
        b.fromBufferAttribute(positions, hit.face.b)
        c.fromBufferAttribute(positions, hit.face.c)
        Triangle.getBarycoord(local, a, b, c, weights)
        const rest = view.bodyRest
        a.fromArray(rest, hit.face.a * 3).multiplyScalar(weights.x)
        b.fromArray(rest, hit.face.b * 3).multiplyScalar(weights.y)
        c.fromArray(rest, hit.face.c * 3).multiplyScalar(weights.z)
        a.add(b).add(c)
        physics.beginGrab(a, hit.point)
        face.grab(true)
        gestures.begin(
          event.clientX,
          event.clientY,
          performance.now(),
          anchor.getBoundingClientRect().width,
        )
      }
      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId || !physics.dragging) return
        setRay(event)
        if (raycaster.ray.intersectPlane(grabPlane, movedTo)) {
          physics.moveGrab(movedTo)
          gestures.move(event.clientX, event.clientY, performance.now())
        }
      }
      const onUp = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return
        physics.endGrab()
        face.grab(false, false)
        const reaction = gestures.release(performance.now())
        // Clear identity before releasing capture: lostpointercapture is cancellation, not another release.
        const releasedId = pointerId
        pointerId = null
        if (canvas.hasPointerCapture(releasedId)) canvas.releasePointerCapture(releasedId)
        if (reaction === 'poke') {
          physics.poke()
          face.react('surprised')
        } else if (reaction === 'happy') face.react('happy')
      }
      const onCancel = (event: PointerEvent) => {
        if (event.pointerId === pointerId) cancelInput()
      }
      const onKey = (event: KeyboardEvent) => {
        if (
          (event.key === ' ' || event.key === 'Enter') &&
          !event.repeat &&
          !staticMode &&
          state === 'idle'
        ) {
          event.preventDefault()
          physics.poke()
          face.react('surprised')
        }
        if (event.key === 'Escape') cancelInput()
      }
      const onGaze = (event: PointerEvent) => {
        if (
          !options.gaze ||
          staticMode ||
          document.hidden ||
          event.pointerType !== 'mouse' ||
          state !== 'idle'
        )
          return
        const rect = canvas.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) return
        const anchor = new Vector3()
        physics.deform(0, 1.2, frontSurfaceZ(0, 1.2), anchor)
        anchor.add(view.actor.position).project(view.camera)
        const x = rect.left + ((anchor.x + 1) * rect.width) / 2
        const y = rect.top + ((1 - anchor.y) * rect.height) / 2
        face.lookAt(
          (event.clientX - x) / (rect.width * 0.42),
          (y - event.clientY) / (rect.height * 0.38),
        )
      }
      const onPointerOut = (event: PointerEvent) => {
        if (!event.relatedTarget) resetGaze()
      }
      canvas.addEventListener('pointerdown', onDown)
      canvas.addEventListener('pointermove', onMove)
      canvas.addEventListener('pointerup', onUp)
      canvas.addEventListener('pointercancel', onCancel)
      canvas.addEventListener('lostpointercapture', onCancel)
      canvas.addEventListener('keydown', onKey)
      if (options.gaze) {
        window.addEventListener('pointermove', onGaze, { passive: true })
        window.addEventListener('pointerout', onPointerOut, { passive: true })
      }
      cleanups.push(() => {
        cancelInput()
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointermove', onMove)
        canvas.removeEventListener('pointerup', onUp)
        canvas.removeEventListener('pointercancel', onCancel)
        canvas.removeEventListener('lostpointercapture', onCancel)
        canvas.removeEventListener('keydown', onKey)
        window.removeEventListener('pointermove', onGaze)
        window.removeEventListener('pointerout', onPointerOut)
      })
    }

    const onGpuError = () => fail('failed')
    gpu.device.addEventListener('uncapturederror', onGpuError)
    cleanups.push(() => gpu.device.removeEventListener('uncapturederror', onGpuError))
    void gpu.device.lost.then(() => {
      if (!disposed) fail('lost')
    })
    if (state === 'idle') physics.startEntry()
    draw()
    options.onReady?.(info!)
    resume()

    return {
      startEntry() {
        if (disposed || staticMode || state !== 'idle') return
        cancelInput()
        face.reset()
        physics.startEntry()
      },
      react(kind) {
        if (!disposed && !staticMode && state === 'idle') face.react(kind)
      },
      reset() {
        cancelInput()
        physics.reset()
        face.reset(0)
        time = 0
        draw()
      },
      setConfig(config) {
        physics.setConfig(config)
      },
      setState(value) {
        state = value
        if (value !== 'idle') {
          cancelInput()
          physics.reset()
          face.reset()
        }
        if (staticMode) draw()
      },
      setStatic(value) {
        staticMode = value
        cancelInput()
        if (value) {
          cancelAnimationFrame(frame)
          frame = 0
          if (benchmarkStarted && benchmarkPhase !== 'complete') {
            benchmarkPhase = 'interrupted'
            benchmarkStarted = 0
          }
          physics.reset()
          face.reset(0)
          time = 0
          resetGaze()
          draw()
        } else resume()
      },
      poke() {
        if (!disposed && !staticMode && state === 'idle') {
          physics.poke()
          face.react('surprised')
        }
      },
      suspend,
      holdPressure(value) {
        if (disposed || staticMode || state !== 'idle') return
        if (value) {
          const point = { x: 0, y: 1.2, z: frontSurfaceZ(0, 1.2) }
          physics.beginGrab(point, point)
          face.grab(true)
        } else {
          physics.endGrab()
          face.grab(false)
        }
      },
      startBenchmark() {
        staticMode = false
        cancelInput()
        physics.reset()
        face.reset(0)
        state = 'idle'
        time = 0
        benchmarkCycle = -1
        benchmarkFrames = []
        benchmarkElapsedMs = 0
        benchmarkStarted = performance.now()
        benchmarkPhase = 'warming-up'
        benchmarkInfo = { ...info }
        resume()
      },
      getBenchmark() {
        return {
          phase: benchmarkPhase,
          report: summarizeFrames(benchmarkFrames),
          info: benchmarkInfo ?? info,
        }
      },
      exportPoster() {
        const background = view.scene.background
        const logicalWidth = canvas.clientWidth
        const logicalHeight = canvas.clientHeight
        const pixelRatio = info.dpr
        try {
          view.scene.background = null
          gpu.renderer.setClearColor(0, 0)
          gpu.renderer.setPixelRatio(SLIME_RECIPE.maxPixelRatio)
          gpu.renderer.setSize(logicalWidth, logicalHeight, false)
          draw()
          return canvas.toDataURL('image/png')
        } finally {
          gpu.renderer.setPixelRatio(pixelRatio)
          gpu.renderer.setSize(logicalWidth, logicalHeight, false)
          view.scene.background = background
          draw()
        }
      },
      simulateDeviceLoss() {
        gpu.device.destroy()
      },
      dispose,
    }
  } catch (error) {
    if (!options.signal.aborted) options.onFailure?.(navigator.gpu ? 'failed' : 'unsupported')
    dispose()
    throw error
  }
}
