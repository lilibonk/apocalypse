/**
 * PixelOrb 尺寸契约（spec §2.2 尺寸阶梯 / §7.1，宪法 §3）。
 *
 * LIL-85：CSS size 合法值 384 / 256 / 128 / 64 / 32。
 * 非法值：开发环境 throw，生产打 error 并吸附最近合法值。
 */

/** 尺寸校验和显示倍率共用的逻辑基准；不表示静态海报的源尺寸。 */
export const ORB_GRID = 32
export const ORB_DEFAULT_SIZE = 64
export const ORB_LEGAL_SIZES = [32, 64, 128, 256, 384] as const

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
 * CSS size → 相对 32px 逻辑基准的显示倍率。
 * 非法值：开发环境 throw；生产打 error 并吸附最近合法值。
 */
export function orbUnit(size: number): number {
  if (isValidOrbSize(size)) return size / ORB_GRID
  const message = `PixelOrb size 必须是 384/256/128/64/32 之一，收到 ${size}。见 docs/brand-slime/solution-fit.md`
  if (import.meta.env.DEV) {
    throw new Error(message)
  }
  console.error(message)
  return nearestOrbSize(size) / ORB_GRID
}
