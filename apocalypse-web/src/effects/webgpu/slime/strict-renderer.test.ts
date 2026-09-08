import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  dispose: vi.fn(),
  backend: vi.fn(),
  renderer: vi.fn(),
}))
vi.mock('three/webgpu', () => ({
  WebGPUBackend: class {
    isWebGPUBackend = true
    constructor(options: unknown) {
      mocks.backend(options)
    }
  },
  StandardNodeLibrary: class {},
  Renderer: class {
    backend: unknown
    init = mocks.init
    dispose = mocks.dispose
    constructor(backend: unknown, options: unknown) {
      this.backend = backend
      mocks.renderer(options)
    }
  },
}))

import { createStrictGpuSession } from './strict-renderer'

const canvas = {} as HTMLCanvasElement
const makeGpu = () => {
  const device = { destroy: vi.fn() }
  const adapter = {
    features: new Set(['float32-filterable']),
    requestDevice: vi.fn().mockResolvedValue(device),
  }
  const gpu = { requestAdapter: vi.fn().mockResolvedValue(adapter) }
  vi.stubGlobal('navigator', { gpu })
  return { device, adapter, gpu }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.init.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe('严格 WebGPU 生命周期', () => {
  it('没有 API / adapter 均失败，不构造任何备用后端', async () => {
    vi.stubGlobal('navigator', {})
    await expect(createStrictGpuSession(canvas, new AbortController().signal)).rejects.toThrow(
      'unavailable',
    )
    const { gpu } = makeGpu()
    gpu.requestAdapter.mockResolvedValue(null)
    await expect(createStrictGpuSession(canvas, new AbortController().signal)).rejects.toThrow(
      'adapter',
    )
    expect(mocks.backend).not.toHaveBeenCalled()
  })
  it('只启用支持的 feature，显式禁用 fallback；dispose 幂等且销毁设备', async () => {
    const { device, adapter } = makeGpu()
    const session = await createStrictGpuSession(canvas, new AbortController().signal)
    expect(adapter.requestDevice).toHaveBeenCalledWith({
      label: 'Apocalypse brand slime',
      requiredFeatures: ['float32-filterable'],
    })
    expect(mocks.renderer).toHaveBeenCalledWith({ alpha: true, antialias: true, getFallback: null })
    session.dispose()
    session.dispose()
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    expect(device.destroy).toHaveBeenCalledTimes(1)
  })
  it('设备创建后发生 abort，释放设备且不初始化 renderer', async () => {
    const controller = new AbortController()
    const { adapter, device } = makeGpu()
    adapter.requestDevice.mockImplementation(async () => {
      controller.abort()
      return device
    })
    await expect(createStrictGpuSession(canvas, controller.signal)).rejects.toThrow()
    expect(device.destroy).toHaveBeenCalledOnce()
    expect(mocks.renderer).not.toHaveBeenCalled()
  })
  it('构造或初始化异常也释放已申请设备', async () => {
    const { device } = makeGpu()
    mocks.backend.mockImplementationOnce(() => {
      throw new Error('constructor failed')
    })
    await expect(createStrictGpuSession(canvas, new AbortController().signal)).rejects.toThrow(
      'constructor failed',
    )
    expect(device.destroy).toHaveBeenCalledOnce()
    mocks.init.mockRejectedValueOnce(new Error('init failed'))
    await expect(createStrictGpuSession(canvas, new AbortController().signal)).rejects.toThrow(
      'init failed',
    )
    expect(device.destroy).toHaveBeenCalledTimes(2)
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })
  it('compile 前初始化晚完成时仍响应卸载取消', async () => {
    const controller = new AbortController()
    const { device } = makeGpu()
    mocks.init.mockImplementationOnce(async () => controller.abort())
    await expect(createStrictGpuSession(canvas, controller.signal)).rejects.toThrow()
    expect(device.destroy).toHaveBeenCalledOnce()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })
})
