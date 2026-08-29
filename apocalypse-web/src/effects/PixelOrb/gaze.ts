/**
 * 视线跟随（spec §2.4）：纯计算，与 DOM 解耦（监听由 PixelOrb.tsx 挂；
 * gaze=false 或双开关命中时组件不挂监听、每帧传零向量）。
 *
 * - 瞳孔/高光整体偏移跟随鼠标，原始视线量限幅 球径 × 0.12
 * - 高光与瞳孔同向、幅度更小（§9.3：瞳孔 = 视线量 ×0.3，高光 ×0.15）
 * - 越过饱和边界后眼球不再移动，多余行程转为球体微倾 2~3°（取水平分量方向）
 * - 鼠标移出：阻尼弹簧回归中心（≈0.5s 收敛）
 */

/** §2.4：视线偏移范围 = 球径 × 0.12（比 PixelBean 更克制，避免「斗鸡眼」）。 */
export const GAZE_RANGE_RATIO = 0.12
/** 鼠标距球心达到该 CSS px 数时视线饱和（沿用 PixelBean 手感）。 */
export const GAZE_SATURATION_PX = 220
/** §2.4：越界球体微倾上限（度，2~3° 取上界 3，按超出行程线性到达）。 */
export const GAZE_TILT_MAX_DEG = 3
/** §9.3：瞳孔偏移 = 视线量 × 0.3。 */
export const GAZE_PUPIL_SHIFT = 0.3
/** §9.3：高光偏移 = 视线量 × 0.15（与瞳孔同向、幅度更小）。 */
export const GAZE_HI_SHIFT = 0.15

export interface GazeOffset {
  /** 原始视线量（栅格 px），已限幅在 球径×0.12 内 */
  x: number
  y: number
  /** 瞳孔偏移（栅格 px） */
  pupilX: number
  pupilY: number
  /** 高光偏移（栅格 px，幅度小于瞳孔） */
  hiX: number
  hiY: number
  /** 越界后的球体微倾（度，-3~3；纯垂直视线不倾） */
  tiltDeg: number
}

const ZERO_GAZE: GazeOffset = { x: 0, y: 0, pupilX: 0, pupilY: 0, hiX: 0, hiY: 0, tiltDeg: 0 }

/**
 * 由「鼠标相对球心的 CSS px 位移」计算视线。
 * diameter 为球体在内部栅格中的直径（格）。
 */
export function computeGaze(dx: number, dy: number, diameter: number): GazeOffset {
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-6 || diameter <= 0) return ZERO_GAZE
  const angle = Math.atan2(dy, dx)
  const reach = Math.min(1, dist / GAZE_SATURATION_PX)
  const range = diameter * GAZE_RANGE_RATIO
  const x = Math.cos(angle) * range * reach
  const y = Math.sin(angle) * range * reach
  // 越过饱和边界：眼球不再移动，多余行程（最多再等量一段）转为球体微倾
  const over = Math.min(1, Math.max(0, dist / GAZE_SATURATION_PX - 1))
  const tiltRaw = over > 0 ? GAZE_TILT_MAX_DEG * over * Math.cos(angle) : 0
  const tiltDeg = Math.abs(tiltRaw) < 1e-9 ? 0 : tiltRaw // 纯垂直视线严格不倾（cos(π/2)≈0 的浮点残渣）
  return {
    x,
    y,
    pupilX: x * GAZE_PUPIL_SHIFT,
    pupilY: y * GAZE_PUPIL_SHIFT,
    hiX: x * GAZE_HI_SHIFT,
    hiY: y * GAZE_HI_SHIFT,
    tiltDeg,
  }
}

/** 阻尼弹簧状态（鼠标移出后视线/微倾回归中心用）。 */
export interface GazeSpring {
  value: number
  velocity: number
}

export function zeroSpring(): GazeSpring {
  return { value: 0, velocity: 0 }
}

// ≈0.5s 收敛的欠阻尼弹簧（ωn=12，ζ≈0.7）：回归带一点弹性而不拖沓（§2.4 弹簧阻尼 0.5s 衰减）
const SPRING_STIFFNESS = 144
const SPRING_DAMPING = 16.8

/** 半隐式欧拉积分一步；dt 单位秒（帧率骤降时限幅防发散）。 */
export function springStep(spring: GazeSpring, target: number, dt: number): GazeSpring {
  const step = Math.min(Math.max(dt, 0), 0.1)
  const acceleration =
    -SPRING_STIFFNESS * (spring.value - target) - SPRING_DAMPING * spring.velocity
  const velocity = spring.velocity + acceleration * step
  return { value: spring.value + velocity * step, velocity }
}
