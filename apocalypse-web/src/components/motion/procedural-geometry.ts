export interface SketchPathPair {
  primary: string
  secondary: string
}

export interface SampledPoint {
  x: number
  y: number
  nx: number
  ny: number
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 基于容器实测宽高与确定性伪随机种子生成双道钢笔出锋三次贝塞尔外框路径。
 * `sketchbook` 世界下四角超出 `3.2px` 出锋并在自适应重排时重新采样，无任何静态位图拉伸失真。
 */
export function buildSketchPaths(width: number, height: number, seed: number): SketchPathPair {
  if (width < 12 || height < 12) {
    return { primary: '', secondary: '' }
  }
  const rand = mulberry32(seed)
  const j = (magnitude: number) => Number(((rand() - 0.5) * 2 * magnitude).toFixed(2))
  const ov = 3.2
  const r = Math.min(10, Math.floor(Math.min(width, height) * 0.2))
  const w = Number(width.toFixed(1))
  const h = Number(height.toFixed(1))

  const primary = [
    `M ${(-ov + 2).toFixed(1)} ${(r + j(1)).toFixed(1)}`,
    `Q 2 ${(1 + j(1)).toFixed(1)} ${r + 2} ${(1 + j(0.8)).toFixed(1)}`,
    `Q ${(w * 0.5).toFixed(1)} ${(1 + j(1.8)).toFixed(1)} ${(w - r + j(1)).toFixed(1)} ${(1 + j(0.8)).toFixed(1)}`,
    `L ${(w + ov - 2).toFixed(1)} ${(1 + j(1.2)).toFixed(1)}`,
    `M ${(w - 1 + j(0.8)).toFixed(1)} ${(-ov + 3).toFixed(1)}`,
    `Q ${(w - 1 + j(1.8)).toFixed(1)} ${(h * 0.5).toFixed(1)} ${(w - 1 + j(0.8)).toFixed(1)} ${(h - r + j(1)).toFixed(1)}`,
    `L ${(w - 1 + j(1)).toFixed(1)} ${(h + ov - 2).toFixed(1)}`,
    `M ${(w + ov - 3).toFixed(1)} ${(h - 1 + j(1)).toFixed(1)}`,
    `Q ${(w * 0.5).toFixed(1)} ${(h - 1 + j(1.8)).toFixed(1)} ${(r + j(1)).toFixed(1)} ${(h - 1 + j(0.8)).toFixed(1)}`,
    `L ${(-ov + 2).toFixed(1)} ${(h - 1 + j(1.2)).toFixed(1)}`,
    `M ${(1 + j(0.8)).toFixed(1)} ${(h + ov - 3).toFixed(1)}`,
    `Q ${(1 + j(1.8)).toFixed(1)} ${(h * 0.5).toFixed(1)} ${(1 + j(0.8)).toFixed(1)} ${(2 + j(1)).toFixed(1)}`,
  ].join(' ')

  const secondary = [
    `M ${(r * 0.5).toFixed(1)} ${(1.8 + j(1.2)).toFixed(1)}`,
    `Q ${(w * 0.5).toFixed(1)} ${(0.4 + j(2.0)).toFixed(1)} ${(w - r * 0.6).toFixed(1)} ${(2 + j(1.2)).toFixed(1)}`,
    `M ${(w - 1.8 + j(1.2)).toFixed(1)} ${(r * 0.5).toFixed(1)}`,
    `Q ${(w - 0.5 + j(1.8)).toFixed(1)} ${(h * 0.52).toFixed(1)} ${(w - 2 + j(1.2)).toFixed(1)} ${(h - r * 0.5).toFixed(1)}`,
    `M ${(w - r * 0.5).toFixed(1)} ${(h - 1.8 + j(1.2)).toFixed(1)}`,
    `Q ${(w * 0.48).toFixed(1)} ${(h - 0.4 + j(2.0)).toFixed(1)} ${(r * 0.6).toFixed(1)} ${(h - 1.8 + j(1.2)).toFixed(1)}`,
    `M ${(1.8 + j(1.2)).toFixed(1)} ${(h - r * 0.5).toFixed(1)}`,
    `Q ${(0.5 + j(1.8)).toFixed(1)} ${(h * 0.48).toFixed(1)} ${(2 + j(1.2)).toFixed(1)} ${(r * 0.5).toFixed(1)}`,
  ].join(' ')

  return { primary, secondary }
}

/** 对三次贝塞尔曲线按步长采样并计算单位法向量，用于构造双岸水彩河道多边形。 */
export function sampleCubic(
  x0: number,
  y0: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  x1: number,
  y1: number,
  steps = 22,
): SampledPoint[] {
  const points: SampledPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const x = u * u * u * x0 + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * x1
    const y = u * u * u * y0 + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * y1
    const dx = 3 * u * u * (cx1 - x0) + 6 * u * t * (cx2 - cx1) + 3 * t * t * (x1 - cx2)
    const dy = 3 * u * u * (cy1 - y0) + 6 * u * t * (cy2 - cy1) + 3 * t * t * (y1 - cy2)
    const length = Math.hypot(dx, dy) || 1
    points.push({ x, y, nx: -dy / length, ny: dx / length })
  }
  return points
}

/** 根据中心贝塞尔控制点生成手绘水彩双岸偏移闭合多边形与两岸钢笔边线。 */
export function buildTwinBankRiver(
  x0: number,
  y0: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  x1: number,
  y1: number,
  halfWidth: number,
) {
  const points = sampleCubic(x0, y0, cx1, cy1, cx2, cy2, x1, y1, 22)
  const upper = points.map(
    (pt) => `${(pt.x + pt.nx * halfWidth).toFixed(1)},${(pt.y + pt.ny * halfWidth).toFixed(1)}`,
  )
  const lowerForward = points.map(
    (pt) => `${(pt.x - pt.nx * halfWidth).toFixed(1)},${(pt.y - pt.ny * halfWidth).toFixed(1)}`,
  )
  const lowerReverse = [...lowerForward].reverse()
  return {
    riverPoly: `M ${upper[0]} L ${upper.slice(1).join(' L ')} L ${lowerReverse.join(' L ')} Z`,
    topBank: `M ${upper[0]} L ${upper.slice(1).join(' L ')}`,
    bottomBank: `M ${lowerForward[0]} L ${lowerForward.slice(1).join(' L ')}`,
  }
}
