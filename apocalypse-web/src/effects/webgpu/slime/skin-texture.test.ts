import { describe, expect, it, vi } from 'vitest'

const loader = vi.hoisted(() => ({ loadAsync: vi.fn() }))
vi.mock('three/webgpu', async (original) => {
  const actual = await original<typeof import('three/webgpu')>()
  return {
    ...actual,
    TextureLoader: class {
      loadAsync = loader.loadAsync
    },
  }
})

import { SRGBColorSpace, Texture } from 'three/webgpu'
import { loadMilkCloudSkin } from './skin-texture'

describe('Milk Cloud skin asset', () => {
  it('loads the local PNG as sRGB while preserving conventional UV orientation', async () => {
    const texture = new Texture()
    loader.loadAsync.mockResolvedValueOnce(texture)
    await expect(loadMilkCloudSkin()).resolves.toBe(texture)
    expect(loader.loadAsync).toHaveBeenCalledWith('/brand/slime/milk-cloud-skin.png')
    expect(texture.colorSpace).toBe(SRGBColorSpace)
    expect(texture.flipY).toBe(true)
  })
})
