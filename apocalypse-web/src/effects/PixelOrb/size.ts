/**
 * PixelOrb 尺寸契约（spec §2.2 尺寸阶梯 / §7.1，宪法 §3）。
 *
 * 内部栅格恒为 128×128；CSS size 合法值 256 / 128 / 64 / 32（32 为图标态）。
 * 非法值：开发环境 throw，生产打 error 并吸附最近合法值。
 */

export const ORB_GRID = 128
export const ORB_DEFAULT_SIZE = 64
export const ORB_LEGAL_SIZES = [32, 64, 128, 256] as const

/**
 * 尺寸阶梯渲染策略（spec §2.2）：
 * full=256 完整体积+表情 / clear=128 双眼+高光 / simple=64 双眼可辨无表情细节 / icon=32 图标态。
 */
export type OrbTier = 'full' | 'clear' | 'simple' | 'icon'

export function isValidOrbSize(size: number): boolean {
  return (ORB_LEGAL_SIZES as readonly number[]).includes(size)
}

/** 吸附最近的合法 size（生产兜底用）。 */
export function nearestOrbSize(size: number): number {
  let best: number = ORB_DEFAULT_SIZE
  for (const legal of ORB_LEGAL_SIZES) {
    if (Math.abs(legal - size) < Math.abs(best - size)) best = legal
  }
  return best
}

/**
 * CSS size → 相对 128 栅格的显示倍率（32=0.25 / 64=0.5 / 128=1 / 256=2）。
 * 非法值：开发环境 throw；生产打 error 并吸附最近合法值。
 */
export function orbUnit(size: number): number {
  if (isValidOrbSize(size)) return size / ORB_GRID
  const message = `PixelOrb size 必须是 256/128/64/32 之一，收到 ${size}。见 docs/pixel-wave-spec.md §2.2`
  if (import.meta.env.DEV) {
    throw new Error(message)
  }
  console.error(message)
  return nearestOrbSize(size) / ORB_GRID
}

/** CSS size → 渲染档位（区间判定，任意入参都有定义；合法 size 经 orbUnit 校验后走准确档）。 */
export function orbTier(size: number): OrbTier {
  if (size >= 256) return 'full'
  if (size >= 128) return 'clear'
  if (size >= 64) return 'simple'
  return 'icon'
}
