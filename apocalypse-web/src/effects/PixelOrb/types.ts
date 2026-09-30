/**
 * PixelOrb 当前角色契约。
 *
 * 状态词表固定为 idle / waiting / success / error / sleeping：
 * loading 语义并入 waiting；thinking 为 2 期 Agent 界面化身预留、当前不实现（宪法 §5）。
 */

/** 状态词汇表（固定，全站共用同一组件表达状态语义，见 src/effects/README.md）。 */
export type OrbState = 'idle' | 'waiting' | 'success' | 'error' | 'sleeping'

/** 组件 props（spec §7.1）。 */
export interface PixelOrbProps {
  /** 状态，默认 'idle' */
  state?: OrbState
  /** CSS 尺寸（px），合法值 384/256/128/64/32；大尺寸交互、小尺寸静态，非法值开发环境 throw */
  size?: number
  /** idle 时眼睛沿皮肤平滑跟随鼠标；静态/闭眼时居中，默认关闭，登录显式启用。 */
  gaze?: boolean
  className?: string
}
