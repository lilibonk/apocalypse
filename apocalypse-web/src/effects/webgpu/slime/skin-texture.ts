import { SRGBColorSpace, TextureLoader, type Texture } from 'three/webgpu'

/** Load the authored pigment in the same colour space as the source PNG. */
export async function loadMilkCloudSkin(): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync('/brand/slime/milk-cloud-skin.png')
  texture.colorSpace = SRGBColorSpace
  return texture
}
