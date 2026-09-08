import { Plane, Raycaster, Triangle, Vector2, Vector3 } from 'three/webgpu'

import type { OrbState } from '@/effects/PixelOrb/types'

import { readSlimeColours, SLIME_RECIPE } from './appearance'
import { advanceGaze, bubblePoint, bubbleVisibility, gazeTarget } from './ambient-motion'
import { eyePoint, mouthPoint } from './expression'
import { trackFocusOrigin } from './focus'
import { summarizeFrames, type FrameReport } from './performance'
import {
  advancePhysics,
  beginPress,
  createPhysics,
  deformPoint,
  moveGrab,
  poke,
  releasePress,
  type SlimePhysics,
} from './physics'
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
    physics: Readonly<SlimePhysics>,
    ambient: { gazeX: number; gazeY: number; bubbleY: number },
  ) => void
}

export interface SlimeRuntime {
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
  let physics = createPhysics()
  let pointerId: number | null = null
  let lastBlink = -1
  let lastGazeX = Number.NaN
  let lastGazeY = Number.NaN
  const gaze = { x: 0, y: 0 }
  let targetGaze = { x: 0, y: 0 }
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
    releasePress(physics)
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
    scene = createSlimeScene(session.renderer, readSlimeColours(canvas))
    const view = scene
    const gpu = session
    const a = new Vector3()
    const b = new Vector3()
    const c = new Vector3()
    const weights = new Vector3()
    const local = new Vector3()
    const scratch = { x: 0, y: 0, z: 0 }
    const eyeBases = view.skins
      .filter((skin) => view.eyeGeometries.includes(skin.geometry))
      .map((skin) => ({ skin, base: new Float32Array(skin.rest) }))
    const mouthSkin = view.skins.find((skin) => skin.geometry === view.mouthGeometry)!

    const poseFace = (blink: number) => {
      if (lastBlink === blink && lastGazeX === gaze.x && lastGazeY === gaze.y) return
      lastBlink = blink
      lastGazeX = gaze.x
      lastGazeY = gaze.y
      for (const { skin, base } of eyeBases) {
        for (let i = 0; i < base.length; i += 3) {
          const point = eyePoint({ x: base[i], y: base[i + 1], z: base[i + 2] }, state, blink, gaze)
          skin.rest[i] = point.x
          skin.rest[i + 1] = point.y
          skin.rest[i + 2] = point.z
        }
      }
      const uv = view.mouthGeometry.getAttribute('uv')
      for (let i = 0; i < uv.count; i++) {
        const point = mouthPoint(uv.getX(i), uv.getY(i), state)
        mouthSkin.rest[i * 3] = point.x
        mouthSkin.rest[i * 3 + 1] = point.y
        mouthSkin.rest[i * 3 + 2] = point.z
      }
    }
    const updateSkin = () => {
      const blinkPhase = physics.elapsed % 5.7
      const blink =
        !staticMode && state !== 'sleeping' && blinkPhase > 5.42
          ? Math.sin(((blinkPhase - 5.42) / 0.28) * Math.PI)
          : 0
      poseFace(blink)
      const breathing = staticMode ? 0 : Math.sin(physics.elapsed * 1.6) * 0.006
      for (const skin of view.skins) {
        const positions = skin.geometry.getAttribute('position')
        for (let i = 0; i < skin.rest.length; i += 3) {
          deformPoint(skin.rest[i], skin.rest[i + 1], skin.rest[i + 2], physics, scratch, breathing)
          positions.setXYZ(i / 3, scratch.x, scratch.y, scratch.z)
        }
        positions.needsUpdate = true
        skin.geometry.computeVertexNormals()
        // Raycasting must not retain stale bounds after a squeeze or pull.
        skin.geometry.boundingSphere = null
        skin.geometry.boundingBox = null
      }
      for (let index = 0; index < view.bubbles.length; index++) {
        const bubble = view.bubbles[index]
        bubblePoint(bubble.rest, bubble.radius, index, staticMode ? 0 : physics.elapsed, scratch)
        bubble.material.opacity = bubbleVisibility(scratch.y)
        deformPoint(scratch.x, scratch.y, scratch.z, physics, scratch, breathing)
        bubble.mesh.position.set(scratch.x, scratch.y, scratch.z)
      }
      view.actor.position.set(physics.x, physics.y, 0)
      view.shadow.position.x = physics.x * 0.6
      view.shadow.scale.setScalar(1 + physics.y * 0.4)
      view.shadowFade.value = 1 / (1 + physics.y * 2.5)
    }
    const draw = () => {
      if (disposed) return
      updateSkin()
      gpu.renderer.render(view.scene, view.camera)
    }

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (width < 1 || height < 1 || disposed) return
      const dpr = Math.min(window.devicePixelRatio || 1, SLIME_RECIPE.maxPixelRatio)
      gpu.renderer.setPixelRatio(dpr)
      gpu.renderer.setSize(Math.round(width), Math.round(height), false)
      view.resize(width, height)
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
        releasePress(physics)
      }
    }
    resize()
    poseFace(0)
    await gpu.renderer.compileAsync(view.scene, view.camera)
    options.signal.throwIfAborted()

    const scriptedBenchmark = (now: number) => {
      if (!benchmarkStarted || benchmarkPhase === 'complete') return
      const elapsed = (now - benchmarkStarted) / 1000
      benchmarkPhase =
        elapsed < 10 ? 'warming-up' : benchmarkElapsedMs < 60000 ? 'measuring' : 'complete'
      if (benchmarkPhase === 'complete') {
        releasePress(physics)
        return
      }
      const cycle = elapsed % 10
      if (cycle < 3) {
        releasePress(physics)
      } else if (cycle < 5.5) {
        if (!physics.pressed) beginPress(physics, { x: 0.25, y: 1.1, z: frontSurfaceZ(0.25, 1.1) })
      } else if (cycle < 8) {
        if (!physics.pressed) beginPress(physics, { x: 0.25, y: 1.1, z: frontSurfaceZ(0.25, 1.1) })
        moveGrab(physics, Math.sin(cycle * 2) * 0.2, 0.46)
      } else {
        releasePress(physics)
      }
    }
    const tick = (now: number) => {
      frame = 0
      if (disposed || document.hidden || externallySuspended || staticMode) return
      const interval = previousTime ? now - previousTime : 0
      previousTime = now
      scriptedBenchmark(now)
      if (interval > 0) {
        advancePhysics(physics, interval / 1000)
        advanceGaze(
          gaze,
          options.gaze && state === 'idle' ? targetGaze : { x: 0, y: 0 },
          interval / 1000,
        )
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
        options.onFrame?.(summarizeFrames(recentFrames), physics, {
          gazeX: gaze.x,
          gazeY: gaze.y,
          bubbleY: view.bubbles[0]?.mesh.position.y ?? 0,
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
      releasePress(physics)
      if (pointerId !== null && canvas.hasPointerCapture(pointerId))
        canvas.releasePointerCapture(pointerId)
      pointerId = null
    }
    const resetGaze = () => {
      targetGaze = { x: 0, y: 0 }
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
        if (staticMode) draw()
      } catch {
        fail('failed')
      }
    }
    const observer = new ResizeObserver(() => {
      resize()
      if (staticMode) draw()
    })
    observer.observe(canvas)
    const themeObserver = new MutationObserver(onTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
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
      let originX = 0
      let originY = 0
      let downX = 0
      let downY = 0
      const setRay = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect()
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((event.clientY - rect.top) / rect.height) * 2,
        )
        raycaster.setFromCamera(pointer, view.camera)
      }
      const onDown = (event: PointerEvent) => {
        if (!event.isPrimary || event.button !== 0 || pointerId !== null || staticMode) return
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
        const rest = view.skins[0].rest
        a.fromArray(rest, hit.face.a * 3).multiplyScalar(weights.x)
        b.fromArray(rest, hit.face.b * 3).multiplyScalar(weights.y)
        c.fromArray(rest, hit.face.c * 3).multiplyScalar(weights.z)
        a.add(b).add(c)
        beginPress(physics, a)
        originX = physics.x
        originY = physics.y
        downX = event.clientX
        downY = event.clientY
      }
      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId || !physics.pressed) return
        if (!physics.dragged && Math.hypot(event.clientX - downX, event.clientY - downY) < 7) return
        setRay(event)
        if (raycaster.ray.intersectPlane(grabPlane, movedTo)) {
          moveGrab(physics, originX + movedTo.x - grabbedAt.x, originY + movedTo.y - grabbedAt.y)
        }
      }
      const onUp = (event: PointerEvent) => {
        if (event.pointerId === pointerId) cancelInput()
      }
      const onKey = (event: KeyboardEvent) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && !staticMode) {
          event.preventDefault()
          poke(physics)
        }
        if (event.key === 'Escape') cancelInput()
      }
      const onGaze = (event: PointerEvent) => {
        if (!options.gaze || staticMode || document.hidden || event.pointerType === 'touch') return
        const rect = canvas.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) return
        targetGaze = gazeTarget(
          ((event.clientX - rect.left) / rect.width - 0.5) * 2,
          (0.5 - (event.clientY - rect.top) / rect.height) * 2,
        )
      }
      const onPointerOut = (event: PointerEvent) => {
        if (!event.relatedTarget) resetGaze()
      }
      canvas.addEventListener('pointerdown', onDown)
      canvas.addEventListener('pointermove', onMove)
      canvas.addEventListener('pointerup', onUp)
      canvas.addEventListener('pointercancel', onUp)
      canvas.addEventListener('lostpointercapture', onUp)
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
        canvas.removeEventListener('pointercancel', onUp)
        canvas.removeEventListener('lostpointercapture', onUp)
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
    draw()
    options.onReady?.(info!)
    resume()

    return {
      setState(value) {
        state = value
        lastBlink = -1
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
          physics = createPhysics()
          gaze.x = 0
          gaze.y = 0
          resetGaze()
          lastBlink = -1
          draw()
        } else resume()
      },
      poke() {
        if (!disposed && !staticMode) poke(physics)
      },
      suspend,
      holdPressure(value) {
        if (value) beginPress(physics, { x: 0, y: 1.03, z: frontSurfaceZ(0, 1.03) })
        else releasePress(physics)
      },
      startBenchmark() {
        staticMode = false
        physics = createPhysics()
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
        view.scene.background = null
        gpu.renderer.setClearColor(0, 0)
        draw()
        const data = canvas.toDataURL('image/png')
        view.scene.background = background
        draw()
        return data
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
