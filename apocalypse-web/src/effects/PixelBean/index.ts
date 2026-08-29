/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 */
export { PixelBean } from './PixelBean'
export type { PixelBeanProps } from './PixelBean'
export { useMascotSkin } from './useMascotSkin'
export { SKINS, DEFAULT_SKIN } from './skins'
export {
  PIXEL_KEYS,
  PX,
  cachedRaster,
  rasterPose,
  composeFrame,
  composeTide,
  poseForState,
} from './draw'
export { PixelTide } from './PixelTide'
export type { PoseId, Raster } from './draw'
export { BEAN_NATIVE_HEIGHT, BEAN_NATIVE_WIDTH, beanUnit, isValidBeanSize } from './size'
export type { SkinId, BeanState, SkinDefinition } from './types'
