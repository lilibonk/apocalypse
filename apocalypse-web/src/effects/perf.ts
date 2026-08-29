/**
 * effects 共享性能监控 + 自动降级（docs/pixel-wave-spec.md §10 性能预算 / §12 P10）。
 *
 * rAF FPS 采样：1s 窗口滚动平均帧率；连续低于阈值（默认 <30fps）的窗口累计
 * 达到持续时长（默认 2s）即判定降级——组件定格为各自的静态降级形态
 * （PixelOrb 静态帧 / PixelWave 纯背景零渲染）、停 rAF、console.info 一次。
 *
 * 判定逻辑是纯函数状态机（createFpsSampler），与组件接线分离，可单测。
 * 双开关（prefers-reduced-motion / 设置「动画」motionEnabled）的静态降级路径
 * 不受影响：它们命中时组件本就不起 rAF，采样器不会创建。
 *
 * 采样空洞保护：单窗口耗时超过 windowMs × 1.5 视为后台标签页 rAF 暂停 /
 * 长任务造成的空洞，该窗口不参与判定并重置低帧累计（极端 <1fps 场景因此
 * 不触发降级，可接受——画面本身已接近静止）。
 */

/** 默认低帧阈值（fps）：窗口平均帧率低于此值记为一个低帧窗口。 */
export const FPS_THRESHOLD = 30
/** 默认持续时长（ms）：低帧窗口累计达到该时长即判定降级。 */
export const FPS_SUSTAIN_MS = 2000
/** 默认采样窗口（ms）：滚动平均粒度。 */
export const FPS_WINDOW_MS = 1000
/** 采样空洞倍率：窗口耗时超过 windowMs × 该值即跳过判定。 */
export const FPS_GAP_WINDOW_RATIO = 1.5

export interface FpsSamplerOptions {
  /** 低帧阈值（fps），默认 30 */
  thresholdFps?: number
  /** 持续低帧时长（ms），默认 2000 */
  sustainMs?: number
  /** 采样窗口（ms），默认 1000 */
  windowMs?: number
}

export interface FpsSampler {
  /**
   * rAF 每帧喂入帧时间戳（performance.now() 口径的 ms）。
   * 返回 true 表示判定为持续低帧（latch：一旦 true 恒 true，组件应定格并停 rAF）。
   */
  tick(nowMs: number): boolean
  /** 最近一个完整窗口的平均 fps；首个窗口未闭合（或刚遇采样空洞）时为 null。 */
  readonly fps: number | null
}

export function createFpsSampler(options: FpsSamplerOptions = {}): FpsSampler {
  const threshold = options.thresholdFps ?? FPS_THRESHOLD
  const sustainMs = options.sustainMs ?? FPS_SUSTAIN_MS
  const windowMs = options.windowMs ?? FPS_WINDOW_MS
  const maxWindowMs = windowMs * FPS_GAP_WINDOW_RATIO

  let started = false
  let windowStart = 0
  let frames = 0
  let lowMs = 0
  let lastFps: number | null = null
  let degraded = false

  return {
    get fps() {
      return lastFps
    },
    tick(nowMs: number): boolean {
      if (degraded) return true
      if (!started) {
        started = true
        windowStart = nowMs
        frames = 1
        return false
      }
      const elapsed = nowMs - windowStart
      if (elapsed < windowMs) {
        frames++
        return false
      }
      // 窗口闭合
      if (elapsed > maxWindowMs) {
        // 采样空洞（后台标签页 rAF 暂停 / 长任务）：不判定，重置低帧累计
        lowMs = 0
        lastFps = null
      } else {
        lastFps = (frames * 1000) / elapsed
        lowMs = lastFps < threshold ? lowMs + elapsed : 0
        if (lowMs >= sustainMs) degraded = true
      }
      windowStart = nowMs
      frames = 1
      return degraded
    },
  }
}
