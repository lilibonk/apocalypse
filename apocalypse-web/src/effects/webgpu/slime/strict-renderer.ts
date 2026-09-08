import { Renderer, StandardNodeLibrary, WebGPUBackend } from 'three/webgpu'

export interface StrictGpuSession {
  renderer: Renderer
  device: GPUDevice
  adapter: GPUAdapter
  dispose: () => void
}

/**
 * Do not replace this with WebGPURenderer: its constructor supplies a WebGL fallback.
 * Keep the explicitly composed backend version-bound (see solution-fit.md).
 */
export async function createStrictGpuSession(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
): Promise<StrictGpuSession> {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable')
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('No WebGPU adapter')
  signal.throwIfAborted()

  // Only enable capabilities needed for the standard renderer's filtering/MSAA path.
  const requiredFeatures = (
    ['float32-filterable', 'core-features-and-limits'] as GPUFeatureName[]
  ).filter((feature) => adapter.features.has(feature))
  const device = await adapter.requestDevice({ label: 'Apocalypse brand slime', requiredFeatures })
  if (signal.aborted) {
    device.destroy()
    signal.throwIfAborted()
  }

  let renderer: Renderer | undefined
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    // The supplied device is application-owned. Renderer disposal does not own its lifetime.
    try {
      renderer?.dispose()
    } finally {
      device.destroy()
    }
  }
  try {
    const backend = new WebGPUBackend({ canvas, device, alpha: true })
    renderer = new Renderer(backend, { alpha: true, antialias: true, getFallback: null })
    renderer.library = new StandardNodeLibrary()
    await renderer.init()
    signal.throwIfAborted()
    if (renderer.backend !== backend || backend.isWebGPUBackend !== true) {
      throw new Error('Unexpected graphics backend')
    }
    return { renderer, device, adapter, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}
