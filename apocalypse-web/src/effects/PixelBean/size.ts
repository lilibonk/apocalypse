/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 *
 * PixelBean 尺寸契约（DEFINITION.md §1）。
 *
 * 内部栅格 128×128；CSS size 必须是 64 的正整数倍（允许 0.5× 整数缩小）。
 * 侧栏 64（0.5×）、设置/空态 128（1×）、PageLoading 256（2×）、
 * 登录移动 256（2×）、登录桌面 512（4×）。
 */

export const BEAN_NATIVE_WIDTH = 128
export const BEAN_NATIVE_HEIGHT = 128
export const BEAN_SIZE_STEP = 64

export function isValidBeanSize(size: number): boolean {
  return Number.isInteger(size) && size >= BEAN_SIZE_STEP && size % BEAN_SIZE_STEP === 0
}

/**
 * CSS size → 相对 128 栅格的显示倍率（0.5 / 1 / 2 / 4 …）。
 * 非法值：开发环境 throw；生产打 error 并吸附。
 */
export function beanUnit(size: number): number {
  if (isValidBeanSize(size)) return size / BEAN_NATIVE_WIDTH
  const message = `PixelBean size 必须是 ${BEAN_SIZE_STEP} 的正整数倍，收到 ${size}。见 src/design/DEFINITION.md §1`
  if (import.meta.env.DEV) {
    throw new Error(message)
  }
  console.error(message)
  return (
    Math.max(BEAN_SIZE_STEP, Math.round(size / BEAN_SIZE_STEP) * BEAN_SIZE_STEP) / BEAN_NATIVE_WIDTH
  )
}
