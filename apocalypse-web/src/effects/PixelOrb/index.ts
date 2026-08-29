export { PixelOrb } from './PixelOrb'
export { ORB_SKINS, DEFAULT_ORB_SKIN } from './skins'
export type { OrbPaletteKey, OrbSkinDefinition, OrbState, PixelOrbProps, SkinId } from './types'
export {
  ORB_DEFAULT_SIZE,
  ORB_GRID,
  ORB_LEGAL_SIZES,
  isValidOrbSize,
  nearestOrbSize,
  orbTier,
  orbUnit,
} from './size'
export type { OrbTier } from './size'
// 纯函数渲染内核（渲染与计算分离，测试与二次开发入口，惯例同 PixelBean barrel）
export {
  ORB_CX,
  ORB_CY,
  ORB_RADIUS,
  createRaster,
  fillCircle,
  fillEllipse,
  quantizeShade,
  rasterizeBody,
  rasterToRgba,
  resolvePalette,
  setPx,
  spherePixel,
  sphereShade,
} from './draw'
export type { OrbRaster, ResolvedPalette, Rgb, SphereSample } from './draw'
export { BLINK_FRAMES, blinkLid, composeOrb, drawEyes, eyeGeometry } from './eyes'
export type { ComposeOrbOpts, DrawEyesOpts, EyeGeometry } from './eyes'
export {
  GAZE_HI_SHIFT,
  GAZE_PUPIL_SHIFT,
  GAZE_RANGE_RATIO,
  GAZE_SATURATION_PX,
  GAZE_TILT_MAX_DEG,
  computeGaze,
  springStep,
  zeroSpring,
} from './gaze'
export type { GazeOffset, GazeSpring } from './gaze'
