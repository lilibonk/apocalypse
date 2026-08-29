/**
 * CRUD 浮层的平面电路传导。
 *
 * 参考真实 PCB 走线：一条固定主路连接数条不对称分支，不铺规则网格；品牌色
 * 脉冲从主路进入并在焊点处分流，已通过线路只保留低亮尾迹。每次打开轨迹一致。
 */

export interface CircuitPoint {
  x: number
  y: number
}

export interface CircuitTrace {
  points: CircuitPoint[]
  delay: number
  length: number
  travel: number
  weight: number
}

export const CIRCUIT_INITIAL_DELAY_SECONDS = 0.72
export const CIRCUIT_TRAVEL_SECONDS = 2.45
export const CIRCUIT_HOLD_SECONDS = 0.38
export const CIRCUIT_FADE_SECONDS = 0.92

function distance(a: CircuitPoint, b: CircuitPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function circuitTraceLength(points: readonly CircuitPoint[]) {
  let length = 0
  for (let index = 1; index < points.length; index++) {
    length += distance(points[index - 1], points[index])
  }
  return length
}

interface FixedPath {
  attachIndex: number
  points: readonly (readonly [number, number])[]
  weight: number
}

/** 设计基准为 448 × 596；坐标归一化后随浮层缩放，但拓扑与时序永久固定。 */
const FIXED_MAIN_PATH: FixedPath = {
  attachIndex: 0,
  weight: 2,
  points: [
    [-0.06, 0.81],
    [0.08, 0.81],
    [0.15, 0.75],
    [0.28, 0.75],
    [0.33, 0.7],
    [0.45, 0.7],
    [0.51, 0.63],
    [0.63, 0.63],
    [0.69, 0.57],
    [0.79, 0.57],
    [0.85, 0.51],
    [0.95, 0.51],
    [1.06, 0.41],
  ],
}

const FIXED_BRANCH_PATHS: readonly FixedPath[] = [
  {
    attachIndex: 4,
    weight: 1,
    points: [
      [0.33, 0.7],
      [0.33, 0.82],
      [0.39, 0.88],
      [0.55, 0.88],
      [0.61, 0.82],
      [0.76, 0.82],
      [0.82, 0.88],
      [1.04, 0.88],
    ],
  },
  {
    attachIndex: 6,
    weight: 1,
    points: [
      [0.51, 0.63],
      [0.45, 0.57],
      [0.32, 0.57],
      [0.25, 0.5],
      [0.09, 0.5],
      [-0.03, 0.4],
    ],
  },
  {
    attachIndex: 8,
    weight: 2,
    points: [
      [0.69, 0.57],
      [0.69, 0.44],
      [0.62, 0.37],
      [0.47, 0.37],
      [0.4, 0.3],
      [0.23, 0.3],
      [0.16, 0.23],
      [-0.03, 0.23],
    ],
  },
  {
    attachIndex: 9,
    weight: 1,
    points: [
      [0.79, 0.57],
      [0.79, 0.69],
      [0.86, 0.76],
      [1.04, 0.76],
    ],
  },
  {
    attachIndex: 10,
    weight: 1,
    points: [
      [0.85, 0.51],
      [0.85, 0.39],
      [0.91, 0.33],
      [1.04, 0.33],
    ],
  },
]

function scalePath(
  path: readonly (readonly [number, number])[],
  width: number,
  height: number,
): CircuitPoint[] {
  return path.map(([x, y]) => ({ x: Math.round(x * width), y: Math.round(y * height) }))
}

function lengthThroughPoint(points: readonly CircuitPoint[], pointIndex: number) {
  return circuitTraceLength(points.slice(0, pointIndex + 1))
}

/** 根据浮层尺寸缩放唯一一套固定 PCB 网络；不存在随机 seed。 */
export function createCircuitTraces(width: number, height: number): CircuitTrace[] {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const mainPoints = scalePath(FIXED_MAIN_PATH.points, safeWidth, safeHeight)
  const mainLength = circuitTraceLength(mainPoints)
  const main: CircuitTrace = {
    points: mainPoints,
    delay: 0,
    length: mainLength,
    travel: CIRCUIT_TRAVEL_SECONDS,
    weight: FIXED_MAIN_PATH.weight,
  }
  const branches = FIXED_BRANCH_PATHS.map((path) => {
    const points = scalePath(path.points, safeWidth, safeHeight)
    const length = circuitTraceLength(points)
    const attachDistance = lengthThroughPoint(mainPoints, path.attachIndex)
    return {
      points,
      delay: (attachDistance / mainLength) * CIRCUIT_TRAVEL_SECONDS + 0.04,
      length,
      travel: Math.max(0.54, (length / mainLength) * CIRCUIT_TRAVEL_SECONDS),
      weight: path.weight,
    }
  })
  return [main, ...branches]
}

function tracePointAt(trace: CircuitTrace, targetDistance: number): CircuitPoint {
  let travelled = 0
  for (let index = 1; index < trace.points.length; index++) {
    const from = trace.points[index - 1]
    const to = trace.points[index]
    const segment = distance(from, to)
    if (travelled + segment >= targetDistance) {
      const ratio = segment === 0 ? 0 : (targetDistance - travelled) / segment
      return {
        x: Math.round(from.x + (to.x - from.x) * ratio),
        y: Math.round(from.y + (to.y - from.y) * ratio),
      }
    }
    travelled += segment
  }
  return trace.points.at(-1) ?? { x: 0, y: 0 }
}

function drawTraceRange(
  ctx: CanvasRenderingContext2D,
  trace: CircuitTrace,
  fromDistance: number,
  toDistance: number,
) {
  if (toDistance <= fromDistance || trace.points.length < 2) return
  const start = tracePointAt(trace, fromDistance)
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)

  let travelled = 0
  for (let index = 1; index < trace.points.length; index++) {
    const from = trace.points[index - 1]
    const to = trace.points[index]
    const segment = distance(from, to)
    const segmentEnd = travelled + segment
    if (segmentEnd <= fromDistance) {
      travelled = segmentEnd
      continue
    }
    if (segmentEnd >= toDistance) {
      const end = tracePointAt(trace, toDistance)
      ctx.lineTo(end.x, end.y)
      break
    }
    ctx.lineTo(to.x, to.y)
    travelled = segmentEnd
  }
  ctx.stroke()
}

/** 绘制低亮已通电线路 + 高亮移动脉冲；首波前保持完全空白。 */
export function renderCircuitTraces(
  ctx: CanvasRenderingContext2D,
  traces: readonly CircuitTrace[],
  time: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'

  for (const trace of traces) {
    const local = time - CIRCUIT_INITIAL_DELAY_SECONDS - trace.delay
    if (local <= 0 || trace.length <= 0) continue

    const progress = Math.min(1, local / trace.travel)
    const head = trace.length * progress
    const fadeStart = trace.travel + CIRCUIT_HOLD_SECONDS
    const fade = Math.max(0, 1 - Math.max(0, local - fadeStart) / CIRCUIT_FADE_SECONDS)
    if (fade <= 0) continue

    ctx.lineWidth = trace.weight
    ctx.globalAlpha = 0.2 * fade
    drawTraceRange(ctx, trace, 0, head)

    const pulseLength = Math.min(92, trace.length * 0.22)
    ctx.lineWidth = trace.weight + 1
    ctx.globalAlpha = 0.94 * fade
    drawTraceRange(ctx, trace, Math.max(0, head - pulseLength), head)

    const terminal = tracePointAt(trace, head)
    const node = trace.weight + 3
    ctx.globalAlpha = fade
    ctx.fillRect(terminal.x - Math.floor(node / 2), terminal.y - Math.floor(node / 2), node, node)
  }

  ctx.globalAlpha = 1
}
