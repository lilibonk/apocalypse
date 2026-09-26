import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Color, type Scene } from 'three/webgpu'
import type { JellyPhysics } from './physics'
import type { FaceMotion } from './face-motion'

const calls = vi.hoisted(() => ({
  dispose: vi.fn(),
  viewDispose: vi.fn(),
  draw: vi.fn(),
  compile: vi.fn(),
  pixelRatios: [] as number[],
  sizes: [] as { width: number; height: number }[],
  observers: [] as { disconnect: ReturnType<typeof vi.fn> }[],
  loadSkin: vi.fn(),
  sceneTextures: [] as { dispose: () => void }[],
}))
let physics: JellyPhysics
let face: FaceMotion
let viewScene: Scene
vi.mock('./appearance', () => ({
  readSlimeColours: () => ({}),
  SLIME_RECIPE: { maxPixelRatio: 2 },
}))
vi.mock('./skin-texture', () => ({ loadMilkCloudSkin: calls.loadSkin }))
vi.mock('./scene', async () => {
  const T = await import('three/webgpu')
  const { FaceMotion } = await import('./face-motion')
  return {
    createSlimeScene(
      _renderer: unknown,
      _colours: unknown,
      p: JellyPhysics,
      skinTexture: { dispose: () => void },
    ) {
      physics = p
      face = new FaceMotion()
      calls.sceneTextures.push(skinTexture)
      const scene = new T.Scene(),
        actor = new T.Group()
      viewScene = scene
      const body = new T.Mesh(new T.SphereGeometry(1, 16, 12), new T.MeshBasicNodeMaterial())
      actor.add(body)
      scene.add(actor)
      const camera = new T.PerspectiveCamera(32, 1, 0.1, 40)
      camera.position.set(0, 0, 5)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      return {
        scene,
        actor,
        body,
        camera,
        bodyRest: new Float32Array(body.geometry.getAttribute('position').array),
        faceMotion: face,
        bubbles: { instanceMatrix: { array: new Float32Array(16) } },
        dizzyStars: { visible: false },
        resize: vi.fn(),
        updateColours: vi.fn(),
        dispose() {
          body.geometry.dispose()
          body.material.dispose()
          skinTexture.dispose()
          calls.viewDispose()
        },
        update(time: number) {
          face.update(time)
          actor.position.copy(p.position)
          scene.updateMatrixWorld(true)
        },
      }
    },
  }
})
vi.mock('./strict-renderer', () => ({
  createStrictGpuSession: async (canvas: HTMLCanvasElement) => {
    let ratio = 1
    const device = Object.assign(new EventTarget(), {
      lost: new Promise(() => {}),
      destroy: vi.fn(),
    })
    return {
      device,
      adapter: { info: { vendor: 'test' } },
      dispose: calls.dispose,
      renderer: {
        compileAsync: calls.compile,
        render: calls.draw,
        setClearColor: vi.fn(),
        setPixelRatio(value: number) {
          ratio = value
          calls.pixelRatios.push(value)
        },
        setSize(w: number, h: number) {
          calls.sizes.push({ width: w, height: h })
          canvas.width = Math.round(w * ratio)
          canvas.height = Math.round(h * ratio)
        },
      },
    }
  },
}))
import { createSlimeRuntime } from './runtime'

let now = 1000,
  nextFrame = 0
let raf = new Map<number, FrameRequestCallback>()
const emit = (target: EventTarget, type: string, fields: Record<string, unknown> = {}) => {
  const event = new Event(type, { cancelable: true })
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value })
  target.dispatchEvent(event)
}
const rect = { left: 0, top: 0, right: 384, bottom: 384, width: 384, height: 384 }
class Canvas extends EventTarget {
  dataset: Record<string, string> = {}
  style = {}
  width = 384
  height = 384
  clientWidth = 384
  clientHeight = 384
  id: number | null = null
  parentElement = null
  closest() {
    return null
  }
  getBoundingClientRect() {
    return rect
  }
  focus() {}
  setPointerCapture(id: number) {
    this.id = id
  }
  hasPointerCapture(id: number) {
    return id === this.id
  }
  releasePointerCapture(id: number) {
    this.id = null
    emit(this, 'lostpointercapture', { pointerId: id })
  }
  toDataURL() {
    return 'data:image/png;base64,test'
  }
}
let doc: EventTarget & { hidden: boolean; documentElement: object }
let win: EventTarget
const advance = (ms: number) => {
  for (let t = 0; t < ms; t += 1000 / 60) {
    now += 1000 / 60
    const callbacks = [...raf.values()]
    raf.clear()
    callbacks.forEach((fn) => fn(now))
  }
}
const pointer = (canvas: Canvas, type: string, x = 192, y = 192) =>
  emit(canvas, type, {
    clientX: x,
    clientY: y,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse',
  })
beforeEach(() => {
  vi.clearAllMocks()
  calls.observers = []
  calls.pixelRatios = []
  calls.sizes = []
  calls.sceneTextures = []
  calls.loadSkin.mockImplementation(async () => ({ dispose: vi.fn() }))
  raf = new Map()
  now = 1000
  nextFrame = 0
  calls.compile.mockResolvedValue(undefined)
  doc = Object.assign(new EventTarget(), { hidden: false, documentElement: {} })
  win = Object.assign(new EventTarget(), { devicePixelRatio: 2 })
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', win)
  vi.stubGlobal('navigator', { gpu: {}, userAgent: 'test' })
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    raf.set(++nextFrame, fn)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => raf.delete(id))
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const Observer = class {
    disconnect = vi.fn()
    constructor() {
      calls.observers.push(this)
    }
    observe() {}
  }
  vi.stubGlobal('ResizeObserver', Observer)
  vi.stubGlobal('MutationObserver', Observer)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('真实运行时：输入、暂停、认证与资源生命周期', () => {
  it('短点触发惊讶；取消/失焦不庆祝；认证状态不接受游戏输入', async () => {
    const canvas = new Canvas(),
      abort = new AbortController()
    const runtime = await createSlimeRuntime(canvas as unknown as HTMLCanvasElement, {
      signal: abort.signal,
    })
    runtime.reset()
    advance(30)
    pointer(canvas, 'pointerdown')
    now += 80
    pointer(canvas, 'pointerup')
    expect(face.expression).toBe('surprised')
    runtime.reset()
    advance(30)
    pointer(canvas, 'pointerdown')
    expect(physics.dragging).toBe(true)
    pointer(canvas, 'pointercancel')
    expect(physics.dragging).toBe(false)
    expect(face.expression).toBe('idle')
    pointer(canvas, 'pointerdown')
    emit(win, 'blur')
    expect(physics.dragging).toBe(false)
    expect(face.expression).toBe('idle')
    runtime.setState('sleeping')
    pointer(canvas, 'pointerdown')
    emit(canvas, 'keydown', { key: ' ', repeat: false })
    expect(physics.dragging).toBe(false)
    expect(physics.velocity.y).toBe(0)
    abort.abort()
    expect(raf.size).toBe(0)
  })
  it('正常 pointerup 的 lostpointercapture 不清除待落地眩晕', async () => {
    const canvas = new Canvas(),
      abort = new AbortController()
    const runtime = await createSlimeRuntime(canvas as unknown as HTMLCanvasElement, {
      signal: abort.signal,
    })
    runtime.reset()
    advance(30)
    pointer(canvas, 'pointerdown')
    for (const x of [265, 120, 265, 120, 192]) {
      now += 50
      pointer(canvas, 'pointermove', x)
    }
    pointer(canvas, 'pointerup')
    advance(100)
    expect(face.expression).toBe('dizzy')
    abort.abort()
  })
  it('触摸、页面隐藏与外部暂停清除鼠标视线目标，恢复后平滑回中', async () => {
    const canvas = new Canvas(),
      abort = new AbortController()
    const runtime = await createSlimeRuntime(canvas as unknown as HTMLCanvasElement, {
      signal: abort.signal,
      gaze: true,
    })
    runtime.reset()
    const look = (pointerType: string) =>
      emit(win, 'pointermove', { pointerType, clientX: 384, clientY: 192 })

    look('mouse')
    expect(face.targetX).toBeGreaterThan(0.9)
    expect(face.targetX).toBeLessThanOrEqual(1)
    advance(200)
    expect(face.state.gazeX).toBeGreaterThan(0.8)
    look('touch')
    expect(face.targetX).toBe(0)
    advance(250)
    expect(face.state.gazeX).toBeLessThan(0.1)

    look('mouse')
    advance(200)
    expect(face.state.gazeX).toBeGreaterThan(0.8)
    doc.hidden = true
    emit(doc, 'visibilitychange')
    expect(face.targetX).toBe(0)
    expect(raf.size).toBe(0)
    doc.hidden = false
    emit(doc, 'visibilitychange')
    advance(250)
    expect(face.state.gazeX).toBeLessThan(0.1)

    look('mouse')
    runtime.suspend(true)
    expect(face.targetX).toBe(0)
    runtime.suspend(false)
    abort.abort()
  })
  it('导出透明海报暂时提高 DPR，成功与异常都恢复像素尺寸、倍率和背景', async () => {
    const canvas = new Canvas(),
      abort = new AbortController()
    Object.assign(win, { devicePixelRatio: 1.25 })
    const runtime = await createSlimeRuntime(canvas as unknown as HTMLCanvasElement, {
      signal: abort.signal,
    })
    const background = new Color('#123456')
    viewScene.background = background
    const initialSize = { width: canvas.width, height: canvas.height }
    expect(initialSize).toEqual({ width: 480, height: 480 })
    const captured: { width: number; height: number; background: Scene['background'] }[] = []
    const encode = vi.spyOn(canvas, 'toDataURL').mockImplementation(() => {
      captured.push({
        width: canvas.width,
        height: canvas.height,
        background: viewScene.background,
      })
      return 'data:image/png;base64,test'
    })

    expect(runtime.exportPoster()).toBe('data:image/png;base64,test')
    expect(captured).toEqual([{ width: 768, height: 768, background: null }])
    expect(canvas.width).toBe(initialSize.width)
    expect(canvas.height).toBe(initialSize.height)
    expect(calls.pixelRatios.slice(-2)).toEqual([2, 1.25])
    expect(calls.sizes.slice(-2)).toEqual([
      { width: 384, height: 384 },
      { width: 384, height: 384 },
    ])
    expect(viewScene.background).toBe(background)

    encode.mockImplementation(() => {
      throw new Error('PNG export blocked')
    })
    const rendered = calls.draw.mock.calls.length
    expect(() => runtime.exportPoster()).toThrow('PNG export blocked')
    expect(calls.draw.mock.calls.length).toBe(rendered + 2)
    expect(canvas.width).toBe(initialSize.width)
    expect(canvas.height).toBe(initialSize.height)
    expect(calls.pixelRatios.slice(-2)).toEqual([2, 1.25])
    expect(viewScene.background).toBe(background)
    abort.abort()
  })
  it('隐藏/离屏暂停而不补算后台时间，静态模式与卸载停止唯一 rAF', async () => {
    const canvas = new Canvas(),
      abort = new AbortController()
    const runtime = await createSlimeRuntime(canvas as unknown as HTMLCanvasElement, {
      signal: abort.signal,
    })
    advance(400)
    doc.hidden = true
    emit(doc, 'visibilitychange')
    const rendered = calls.draw.mock.calls.length
    advance(10000)
    expect(calls.draw).toHaveBeenCalledTimes(rendered)
    expect(raf.size).toBe(0)
    doc.hidden = false
    emit(doc, 'visibilitychange')
    advance(100)
    expect(calls.draw.mock.calls.length).toBeGreaterThan(rendered)
    runtime.suspend(true)
    expect(raf.size).toBe(0)
    runtime.suspend(false)
    expect(raf.size).toBe(1)
    runtime.setStatic(true)
    expect(raf.size).toBe(0)
    runtime.setStatic(false)
    expect(raf.size).toBe(1)
    abort.abort()
    runtime.dispose()
    expect(raf.size).toBe(0)
    expect(calls.dispose).toHaveBeenCalledOnce()
    expect(calls.viewDispose).toHaveBeenCalledOnce()
    expect(calls.observers.every((o) => o.disconnect.mock.calls.length === 1)).toBe(true)
    emit(doc, 'visibilitychange')
    emit(win, 'blur')
    expect(raf.size).toBe(0)
  })
  it('编译期间取消仍释放已构建网格和设备，不安排动画', async () => {
    const canvas = new Canvas(),
      abort = new AbortController()
    calls.compile.mockImplementationOnce(async () => abort.abort())
    await expect(
      createSlimeRuntime(canvas as unknown as HTMLCanvasElement, { signal: abort.signal }),
    ).rejects.toThrow()
    expect(raf.size).toBe(0)
    expect(calls.dispose).toHaveBeenCalledOnce()
    expect(calls.viewDispose).toHaveBeenCalledOnce()
  })
  it('贴图加载完成后才创建场景并通知 ready，卸载由场景释放贴图', async () => {
    const canvas = new Canvas(),
      abort = new AbortController(),
      onReady = vi.fn()
    let resolveSkin!: (texture: { dispose: ReturnType<typeof vi.fn> }) => void
    calls.loadSkin.mockImplementationOnce(() => new Promise((resolve) => (resolveSkin = resolve)))
    const creating = createSlimeRuntime(canvas as unknown as HTMLCanvasElement, {
      signal: abort.signal,
      onReady,
    })
    await vi.waitFor(() => expect(calls.loadSkin).toHaveBeenCalledOnce())
    expect(calls.sceneTextures).toHaveLength(0)
    expect(onReady).not.toHaveBeenCalled()

    const texture = { dispose: vi.fn() }
    resolveSkin(texture)
    const runtime = await creating
    expect(calls.sceneTextures).toEqual([texture])
    expect(onReady).toHaveBeenCalledOnce()
    expect(texture.dispose).not.toHaveBeenCalled()
    abort.abort()
    runtime.dispose()
    expect(texture.dispose).toHaveBeenCalledOnce()
    expect(calls.dispose).toHaveBeenCalledOnce()
  })
  it('贴图晚于取消返回时释放孤儿贴图，不创建场景或报告失败', async () => {
    const canvas = new Canvas(),
      abort = new AbortController(),
      onReady = vi.fn(),
      onFailure = vi.fn()
    let resolveSkin!: (texture: { dispose: ReturnType<typeof vi.fn> }) => void
    calls.loadSkin.mockImplementationOnce(() => new Promise((resolve) => (resolveSkin = resolve)))
    const creating = createSlimeRuntime(canvas as unknown as HTMLCanvasElement, {
      signal: abort.signal,
      onReady,
      onFailure,
    })
    await vi.waitFor(() => expect(calls.loadSkin).toHaveBeenCalledOnce())
    abort.abort()
    expect(calls.dispose).toHaveBeenCalledOnce()
    const texture = { dispose: vi.fn() }
    resolveSkin(texture)
    await expect(creating).rejects.toMatchObject({ name: 'AbortError' })
    expect(texture.dispose).toHaveBeenCalledOnce()
    expect(calls.sceneTextures).toHaveLength(0)
    expect(calls.viewDispose).not.toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()
    expect(onFailure).not.toHaveBeenCalled()
    expect(raf.size).toBe(0)
  })
  it('贴图加载失败回退并释放设备，不创建场景或安排动画', async () => {
    const canvas = new Canvas(),
      abort = new AbortController(),
      onReady = vi.fn(),
      onFailure = vi.fn()
    calls.loadSkin.mockRejectedValueOnce(new Error('skin image unavailable'))
    await expect(
      createSlimeRuntime(canvas as unknown as HTMLCanvasElement, {
        signal: abort.signal,
        onReady,
        onFailure,
      }),
    ).rejects.toThrow('skin image unavailable')
    expect(onFailure).toHaveBeenCalledExactlyOnceWith('failed')
    expect(onReady).not.toHaveBeenCalled()
    expect(calls.dispose).toHaveBeenCalledOnce()
    expect(calls.sceneTextures).toHaveLength(0)
    expect(calls.viewDispose).not.toHaveBeenCalled()
    expect(raf.size).toBe(0)
  })
})
