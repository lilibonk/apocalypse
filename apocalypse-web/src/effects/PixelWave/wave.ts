/**
 * PixelWave 双场计算（v2.11，docs/pixel-wave-spec.md §23）。
 *
 * flowlight：保留稀疏方形环 + 对角走廊，服务加载与空状态。
 * letterpress：登录专用完整网格，从随机角点发射欧氏波前，快速指数抬升后以
 * 指数长尾回落；阈值以上格子 100% 参与。每波独立 seed 同时驱动距离扭曲、
 * 点火、空间连续色带与高度纹理，形成研究演示图 3 的整片柱体浪潮。
 *
 * 两场均为纯函数并预计算 typed-array cache；热路径复用 field / lanes / lifts，
 * flowlight 按 ~10fps 步进，letterpress 跟随 rAF 连续计算且逐帧零分配。
 */

/** 单格传导参数（createTypeCache 的分通道布局）。 */
export interface ConduitSchedule {
  /** 方形环归一坐标 [0,1]：0 = 左下角（涟漪原点），1 = 最远角（切比雪夫距离） */
  u: number
  /** 点火时刻伪随机抖动（秒，[0, FIRE_JITTER_SECONDS)） */
  jitter: number
  /** 色相种子 [0,1)：× HUE_SEED_SPAN 得 hue 偏移 */
  hueSeed: number
}

/** 时间不变量预计算缓存，与 gridW × gridH 一一对应（行优先）。 */
export interface TypeCache {
  gridW: number
  gridH: number
  /** 当前噪声图 seed；每个波序号都不同。 */
  seed: number
  u: Float32Array
  jitter: Float32Array
  hueSeed: Float32Array
  /** 浮雕高度倍率 [0.75,1.35]；每波随 seed 换新，形成不同高低纹理。 */
  terrain: Float32Array
  /** 对角走廊掩码（1 = 参与涟漪，0 = 永不点亮） */
  corridor: Uint8Array
  /** 淡流光参与掩码（1 = 波带内参与起落，0 = 波带内也不亮——不是每个方块） */
  takePart: Uint8Array
}

export type LetterpressCorner = 0 | 1 | 2 | 3

/** 登录 letterpress 专用的完整连续波场缓存。 */
export interface LetterpressCache {
  gridW: number
  gridH: number
  seed: number
  corner: LetterpressCorner
  /** 从当波角点到格心的归一化欧氏距离，已叠加低频轮廓扭曲。 */
  distance: Float32Array
  /** 点火时刻抖动（秒，正负均可）。 */
  jitter: Float32Array
  hueSeed: Float32Array
  /** 波前到达时刻（distance × travel + jitter），避免连续帧重复乘加。 */
  arrival: Float32Array
  /** 不含 baseHue / 时间流动的空间色相相位，避免连续帧重复 atan2。 */
  huePhase: Float32Array
  /** 浮雕高度倍率 [0.75,1.35]。 */
  terrain: Float32Array
}

/** 方形涟漪从原点（u=0）传导到最远角（u=1）的时长（秒，场时间轴） */
export const WAVE_TRAVEL_SECONDS = 3
/** 涟漪发射间隔（秒，场时间轴）；interval < travel + dwell 时多环在途 */
export const WAVE_INTERVAL_SECONDS = 4.5
/** 铅字块点亮停留时长（秒）：波前到达后亮 dwell 即熄灭（按下/抬起） */
export const WAVE_DWELL_SECONDS = 0.5
/** 登录铅字浮雕的快速抬升时间；余下点火窗用于回落。 */
export const LETTERPRESS_ATTACK_SECONDS = 0.09
/** 登录连续浪潮的指数回落时间常数。 */
export const LETTERPRESS_TAIL_SECONDS = 0.38
/** 登录连续浪潮扫过品牌舞台对角线的时间。 */
export const LETTERPRESS_TRAVEL_SECONDS = 2.4
/** 登录连续浪潮的发射间隔。 */
export const LETTERPRESS_INTERVAL_SECONDS = 7
/** 首波延时，让登录内容先完成入场。 */
export const LETTERPRESS_INITIAL_DELAY_SECONDS = 0.8
/** 低于此高度的格子精确归零。 */
export const LETTERPRESS_CUTOFF = 0.03
/** 超过该到达后时长时指数包络必低于 cutoff，可在进入 exp 前短路。 */
export const LETTERPRESS_ACTIVE_SECONDS = -LETTERPRESS_TAIL_SECONDS * Math.log(LETTERPRESS_CUTOFF)
/** 登录铅字固定节距：28px 顶面 + 4px 缝隙。 */
export const LETTERPRESS_PITCH = 32
export const LETTERPRESS_GAP = 4
/** 登录剪影流光沿四分之一波前的色相跨度、时间流速与逐格轻微抖动。 */
export const LETTERPRESS_FLOW_SPREAD_DEG = 180
export const LETTERPRESS_FLOW_SPEED_DEG = 120
export const LETTERPRESS_HUE_JITTER_DEG = 76
/** 单格点火时刻最大正抖动（秒）：打破机械齐步走，有机感 */
export const FIRE_JITTER_SECONDS = 0.18
/** 对角走廊半宽（归一化对角距离 |nx − noy| 上限）：约束涟漪沿对角线传导，不漫入表单区 */
export const CORRIDOR_HALF = 0.1
/** 波带内方块的参与率（每格固定伪随机）：不是每个方块都亮——波带里仅约 1/3 方块泛起淡流光 */
export const PARTICIPATION = 0.35
/** 每波噪声对方形环到达坐标的最大扭曲幅度（归一化 u）。 */
export const WAVE_ROUGHNESS_U = 0.075
/** 全页氛围的等分切割列数（fill 模式）：容器宽 ÷ 48 得方形大铅字块 */
export const FILL_COLS = 48
/** hue 种子色带幅度（度）：块与块之间 hue 各异的总跨度 */
export const HUE_SEED_SPAN = 120
/** hue 时间慢漂幅度（度，±）与角频率（rad/s） */
export const HUE_OSC_DEG = 10
export const HUE_OSC_FREQ = 0.4
/** 五彩 hue 量化道数（15°/道：色带像素感 + 渲染按道分桶） */
export const HUE_LANES = 24
/** 基准 hue 回退值（--brand 非 oklch 写法解析失败时；280 ≈ 长春花蓝相位） */
export const DEFAULT_BASE_HUE = 280
/** 步进帧率（fps）：场状态按该栅格离散更新，强化印刷机械感并省 CPU */
export const STEP_FPS = 10

/**
 * 格坐标伪随机 hash（纯函数，确定性）：同 (x, y, salt) 恒同果，值域 [0,1)。
 * 32 位整数混合（imul/>>> 为 ECMAScript 规范行为，跨引擎一致）；salt 区分
 * 通道（抖动/色种子），保证各通道去相关。
 */
export function cellHash(x: number, y: number, salt: number, seed: number = 0): number {
  let h =
    Math.imul(x | 0, 0x27d4eb2d) ^
    Math.imul(y | 0, 0x165667b1) ^
    Math.imul(salt | 0, 0x9e3779b1) ^
    Math.imul(seed | 0, 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** session seed + 波序号 → 当波独立 seed；首波保留 session seed，便于测试与复现。 */
export function waveSeed(sessionSeed: number, waveIndex: number): number {
  const session = sessionSeed >>> 0
  const index = Math.max(0, Math.floor(waveIndex))
  if (index === 0) return session
  let h = session ^ Math.imul(index, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** 当前周期对应的波序号（首波为 0）。 */
export function waveIndexAt(time: number, interval: number = WAVE_INTERVAL_SECONDS): number {
  if (time <= 0) return 0
  return Math.max(0, Math.floor(time / interval))
}

/** 当前波从发射起经过的本地时间。 */
export function waveLocalTime(time: number, interval: number = WAVE_INTERVAL_SECONDS): number {
  const safeTime = Math.max(0, time)
  return safeTime - waveIndexAt(safeTime, interval) * interval
}

/** 登录连续浪潮的当前波序号；首波延时前为 -1。 */
export function letterpressWaveIndexAt(time: number): number {
  if (time < LETTERPRESS_INITIAL_DELAY_SECONDS) return -1
  return Math.floor((time - LETTERPRESS_INITIAL_DELAY_SECONDS) / LETTERPRESS_INTERVAL_SECONDS)
}

/** 登录连续浪潮的当波本地时间；首波延时前为 0。 */
export function letterpressWaveLocalTime(time: number): number {
  const index = letterpressWaveIndexAt(time)
  if (index < 0) return 0
  return time - LETTERPRESS_INITIAL_DELAY_SECONDS - index * LETTERPRESS_INTERVAL_SECONDS
}

/**
 * session seed + 波序号 → 随机角点；迭代修正保证相邻波不从同一角点发射。
 * 0/1/2/3 = TL/TR/BR/BL。
 */
export function letterpressCorner(sessionSeed: number, waveIndex: number): LetterpressCorner {
  const last = Math.max(0, Math.floor(waveIndex))
  let previous = -1
  for (let index = 0; index <= last; index++) {
    let corner = Math.floor(cellHash(index, 31, 9, sessionSeed) * 4)
    if (corner === previous) {
      corner = (corner + 1 + Math.floor(cellHash(index, 47, 10, sessionSeed) * 3)) % 4
    }
    previous = corner
  }
  return previous as LetterpressCorner
}

/** seed 化平滑值噪声（双线性插值 + smoothstep），输出 [-1,1]。 */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const sx = xf * xf * (3 - 2 * xf)
  const sy = yf * yf * (3 - 2 * yf)
  const a = cellHash(xi, yi, 17, seed)
  const b = cellHash(xi + 1, yi, 17, seed)
  const c = cellHash(xi, yi + 1, 17, seed)
  const d = cellHash(xi + 1, yi + 1, 17, seed)
  const value = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  return value * 2 - 1
}

/** 从指定角点到格心的归一化欧氏距离（以实际网格宽高计算，最远角约为 1）。 */
export function letterpressDistance(
  x: number,
  y: number,
  gridW: number,
  gridH: number,
  corner: LetterpressCorner,
): number {
  const originX = corner === 0 || corner === 3 ? 0 : gridW
  const originY = corner === 0 || corner === 1 ? 0 : gridH
  const dx = x + 0.5 - originX
  const dy = y + 0.5 - originY
  const diagonal = Math.hypot(gridW, gridH)
  return diagonal > 0 ? Math.hypot(dx, dy) / diagonal : 0
}

/**
 * 登录连续浪潮的空间连续色相：沿当前角点的 90° 波前展开 180° 色带，
 * 再叠加时间流动与当波逐格小抖动。相邻格主体保持同一色带，不再随机跳色。
 */
export function letterpressHue(
  x: number,
  y: number,
  gridW: number,
  gridH: number,
  corner: LetterpressCorner,
  hueSeed: number,
  time: number,
  baseHue: number,
): number {
  const originX = corner === 0 || corner === 3 ? 0 : gridW
  const originY = corner === 0 || corner === 1 ? 0 : gridH
  const theta = Math.atan2(y + 0.5 - originY, x + 0.5 - originX)
  const arc = corner * (Math.PI / 2)
  const relative = (((theta - arc) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const normalized = Math.min(1, Math.max(0, relative / (Math.PI / 2)))
  const hue =
    baseHue +
    normalized * LETTERPRESS_FLOW_SPREAD_DEG +
    time * LETTERPRESS_FLOW_SPEED_DEG +
    (hueSeed - 0.5) * LETTERPRESS_HUE_JITTER_DEG
  return ((hue % 360) + 360) % 360
}

/** 每波登录连续浪潮缓存：距离轮廓、点火、色相与高度全部随 seed 换新。 */
export function createLetterpressCache(
  gridW: number,
  gridH: number,
  seed: number,
  corner: LetterpressCorner,
): LetterpressCache {
  const size = gridW * gridH
  const cache: LetterpressCache = {
    gridW,
    gridH,
    seed: seed >>> 0,
    corner,
    distance: new Float32Array(size),
    jitter: new Float32Array(size),
    hueSeed: new Float32Array(size),
    arrival: new Float32Array(size),
    huePhase: new Float32Array(size),
    terrain: new Float32Array(size),
  }
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const i = y * gridW + x
      const baseDistance = letterpressDistance(x, y, gridW, gridH, corner)
      const rough =
        valueNoise(x / 3.5 + 7.3, y / 3.5 + 2.1, cache.seed + 0x51ed) * 0.65 +
        valueNoise(x / 8 + 13.7, y / 8 + 9.4, cache.seed + 0x9e37) * 0.35
      cache.distance[i] = Math.max(0, baseDistance + rough * WAVE_ROUGHNESS_U)
      cache.jitter[i] = (cellHash(x, y, 5, cache.seed) - 0.5) * 0.09
      cache.hueSeed[i] = cellHash(x, y, 4, cache.seed)
      cache.arrival[i] = cache.distance[i] * LETTERPRESS_TRAVEL_SECONDS + cache.jitter[i]
      cache.huePhase[i] = letterpressHue(x, y, gridW, gridH, corner, cache.hueSeed[i], 0, 0)
      const terrainNoise = valueNoise(x / 4 + 19.1, y / 4 + 3.7, cache.seed + 0xc2b2)
      cache.terrain[i] = 1.05 + terrainNoise * 0.3
    }
  }
  return cache
}

/**
 * 单格方形环归一坐标（纯函数）：到左下角原点的**切比雪夫距离**（max 范数）
 * ÷ 最远角距离；0 = 左下角（涟漪原点），1 = 最远角。同 u 的格子构成一个
 * 方形环（L 形波前：第 k 环 = 行 oy=k ∪ 列 x=k），逐环放大即方形涟漪。
 */
export function squareCoord(x: number, y: number, gridW: number, gridH: number): number {
  const oy = gridH - 1 - y // 距底边的格数（原点在最底行）
  const max = Math.max(gridW - 1, gridH - 1)
  if (max <= 0) return 0
  return Math.max(x, oy) / max
}

/**
 * 对角走廊（纯函数）：归一化坐标 |x/(W-1) − oy/(H-1)| ≤ half 的格子参与涟漪。
 * 涟漪沿页面对角线（左下 → 右上）传导，走廊外永不点亮（表单区不受干扰）。
 */
export function inDiagonalCorridor(
  x: number,
  y: number,
  gridW: number,
  gridH: number,
  half: number = CORRIDOR_HALF,
): boolean {
  const nx = gridW > 1 ? x / (gridW - 1) : 0
  const noy = gridH > 1 ? (gridH - 1 - y) / (gridH - 1) : 0
  return Math.abs(nx - noy) <= half
}

/** 等分切割结果（fill 模式的方形大铅字块布局）。 */
export interface EqualDivision {
  /** 方形块边长（CSS px，4 的倍数，min 4） */
  block: number
  /** 块间隙（CSS px，block/8，夹 [2,12]） */
  gap: number
  gridW: number
  gridH: number
}

/**
 * 等分切割（纯函数）：容器宽 ÷ cols 得方形大铅字块（边长取 4 的倍数对齐
 * 像素网格），gap = block/8（铅字缝隙），行数按周期铺满（超出对称裁切）。
 */
export function equalDivision(cssW: number, cssH: number, cols: number = FILL_COLS): EqualDivision {
  const c = Math.max(1, Math.round(cols))
  const block = Math.max(4, Math.floor(cssW / c / 4) * 4)
  const gap = Math.min(12, Math.max(2, Math.round(block / 8)))
  const pitch = block + gap
  return {
    block,
    gap,
    gridW: c,
    gridH: Math.max(1, Math.ceil(cssH / pitch)),
  }
}

/** 登录 letterpress 固定 32px 节距：28px 顶面 + 4px 缝隙，完整铺满并对称裁切。 */
export function letterpressDivision(cssW: number, cssH: number): EqualDivision {
  const pitch = LETTERPRESS_PITCH
  return {
    block: pitch - LETTERPRESS_GAP,
    gap: LETTERPRESS_GAP,
    gridW: Math.max(1, Math.ceil(cssW / pitch)),
    gridH: Math.max(1, Math.ceil(cssH / pitch)),
  }
}

/**
 * 单格点火基底时刻（纯函数）：方形环坐标 × 传导时长 + 抖动。
 * 第 k 环（k = 0,1,2…）到达该格的时刻 = base + k × WAVE_INTERVAL_SECONDS。
 */
export function fireBase(u: number, jitter: number): number {
  return u * WAVE_TRAVEL_SECONDS + jitter
}

/** 命中该格的最新环序号（纯函数）：< 0 = 首环尚未到达（从左下角开始扩散）。 */
export function fireWaveIndex(
  time: number,
  base: number,
  interval: number = WAVE_INTERVAL_SECONDS,
): number {
  return Math.floor((time - base) / interval)
}

/**
 * 单格 ON/OFF 判定（纯函数）：环已到达且处于点亮停留窗内 → ON。
 * 硬切换（铅字按下/抬起），无淡入淡出；同参同果。
 */
export function cellLit(
  base: number,
  time: number,
  interval: number = WAVE_INTERVAL_SECONDS,
  dwell: number = WAVE_DWELL_SECONDS,
): boolean {
  const k = fireWaveIndex(time, base, interval)
  if (k < 0) return false
  return time - (k * interval + base) < dwell
}

/**
 * 登录铅字的连续波包：快速指数抬升 × 指数长尾。
 * 与研究演示一致；输入为波前到达格子后的秒数，未到达时精确为 0。
 */
export function letterpressLift(
  elapsed: number,
  attack: number = LETTERPRESS_ATTACK_SECONDS,
  tail: number = LETTERPRESS_TAIL_SECONDS,
): number {
  if (elapsed <= 0 || attack <= 0 || tail <= 0) return 0
  return (1 - Math.exp(-elapsed / attack)) * Math.exp(-elapsed / tail)
}

/**
 * 单格五彩 hue（纯函数，确定性）：基准 hue（--brand 解析，回退 DEFAULT_BASE_HUE）
 * + hueSeed × HUE_SEED_SPAN（块块异色）+ 时间慢漂（±HUE_OSC_DEG 正弦），
 * 包裹到 [0, 360)。
 */
export function typeHue(hueSeed: number, time: number, baseHue: number): number {
  const hue =
    baseHue +
    hueSeed * HUE_SEED_SPAN +
    Math.sin(time * HUE_OSC_FREQ + hueSeed * Math.PI * 2) * HUE_OSC_DEG
  return ((hue % 360) + 360) % 360
}

/** hue → 量化道索引 [0, HUE_LANES)（渲染分桶键，纯函数）。 */
export function hueLaneIndex(hue: number): number {
  const wrapped = ((hue % 360) + 360) % 360
  return Math.min(HUE_LANES - 1, Math.floor((wrapped / 360) * HUE_LANES))
}

/** 场时间 → 步进时间（纯函数）：按 STEP_FPS 向下取整，离散步进更新。 */
export function stepTime(time: number, fps: number = STEP_FPS): number {
  return Math.floor(time * fps) / fps
}

/**
 * 当波噪声图预计算：每格扭曲 u / 点火抖动 / 色种子 / 参与掩码。
 * seed 每波更换；走廊几何保持稳定，避免登录表单被波纹漫入。
 */
export function createTypeCache(gridW: number, gridH: number, seed: number = 0): TypeCache {
  const size = gridW * gridH
  const cache: TypeCache = {
    gridW,
    gridH,
    seed: seed >>> 0,
    u: new Float32Array(size),
    jitter: new Float32Array(size),
    hueSeed: new Float32Array(size),
    terrain: new Float32Array(size),
    corridor: new Uint8Array(size),
    takePart: new Uint8Array(size),
  }
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const i = y * gridW + x
      const baseU = squareCoord(x, y, gridW, gridH)
      const rough =
        valueNoise(x / 3.5 + 7.3, y / 3.5 + 2.1, cache.seed + 0x51ed) * 0.65 +
        valueNoise(x / 8 + 13.7, y / 8 + 9.4, cache.seed + 0x9e37) * 0.35
      cache.u[i] = Math.min(1, Math.max(0, baseU + rough * WAVE_ROUGHNESS_U))
      cache.jitter[i] = cellHash(x, y, 5, cache.seed) * FIRE_JITTER_SECONDS
      cache.hueSeed[i] = cellHash(x, y, 4, cache.seed)
      // 低频高度纹理：同一波相邻块连续、下一波随 seed 整张换新。
      const terrainNoise = valueNoise(x / 4 + 19.1, y / 4 + 3.7, cache.seed + 0xc2b2)
      cache.terrain[i] = 1.05 + terrainNoise * 0.3
      cache.corridor[i] = inDiagonalCorridor(x, y, gridW, gridH) ? 1 : 0
      cache.takePart[i] = cellHash(x, y, 6, cache.seed) < PARTICIPATION ? 1 : 0
    }
  }
  return cache
}

/**
 * v2.1 填充模式（保留）：显式 cols/rows 时按容器尺寸 ÷ (blockSize+gap) 用
 * ceil 推导网格铺满（超出部分由画布对称裁切）；fill 模式走 equalDivision。
 */
export function deriveGridCount(cssPx: number, step: number, explicit?: number): number {
  if (explicit !== undefined) return Math.max(1, Math.round(explicit))
  return Math.max(1, Math.ceil(cssPx / step))
}

/** computeTypeField 的场参数（每个步进帧由组件装配）。 */
export interface TypeFieldParams {
  /** 场时间（秒；letterpress 为连续 rAF 时间，flowlight 为 STEP_FPS 步进时间） */
  time: number
  /** 基准 hue（--brand 解析 / DEFAULT_BASE_HUE 回退） */
  baseHue: number
  /** 本次组件挂载的随机 seed；同一 session 内按波序号派生新噪声图。 */
  sessionSeed?: number
}

/**
 * 登录 letterpress 连续波场：完整网格参与，欧氏波前 + 快速抬升 + 指数长尾。
 * 与默认 flowlight 的稀疏方形环完全分离，避免其它挂载点发生视觉回归。
 */
export function computeLetterpressField(
  gridW: number,
  gridH: number,
  params: TypeFieldParams,
  cache?: LetterpressCache,
  out?: Uint8Array,
  lanesOut?: Uint8Array,
  liftOut?: Float32Array,
): Uint8Array {
  const size = gridW * gridH
  const { time, baseHue, sessionSeed = 0 } = params
  const field = out && out.length >= size ? out : new Uint8Array(size)
  const lanes = lanesOut && lanesOut.length >= size ? lanesOut : new Uint8Array(size)
  const lifts = liftOut && liftOut.length >= size ? liftOut : new Float32Array(size)
  field.fill(0)
  lifts.fill(0)

  const index = letterpressWaveIndexAt(time)
  if (index < 0) return field
  const seed = waveSeed(sessionSeed, index)
  const corner = letterpressCorner(sessionSeed, index)
  const c =
    cache &&
    cache.gridW === gridW &&
    cache.gridH === gridH &&
    cache.seed === seed &&
    cache.corner === corner
      ? cache
      : createLetterpressCache(gridW, gridH, seed, corner)
  const localTime = letterpressWaveLocalTime(time)

  for (let i = 0; i < size; i++) {
    const elapsed = localTime - c.arrival[i]
    if (elapsed <= 0 || elapsed >= LETTERPRESS_ACTIVE_SECONDS) continue
    const bump = letterpressLift(elapsed)
    if (bump < LETTERPRESS_CUTOFF) continue
    field[i] = 1
    lanes[i] = hueLaneIndex(baseHue + c.huePhase[i] + time * LETTERPRESS_FLOW_SPEED_DEG)
    lifts[i] = bump * c.terrain[i]
  }
  return field
}

/**
 * 方形涟漪场：逐格 ON/OFF 判定（0/1，走廊外恒 0），并给出 ON 格的 hue 道。
 *
 * @param cache    可选预计算缓存（尺寸不符时内部重建）；热路径应传入
 * @param out      可选复用场缓冲（长度 ≥ gridW × gridH 时复用并原引用返回）
 * @param lanesOut 可选复用 hue 道缓冲（同上；渲染侧只读 field === 1 的格）
 * @param liftOut  可选复用浮雕高度缓冲；仅登录 letterpress 渲染器需要
 */
export function computeTypeField(
  gridW: number,
  gridH: number,
  params: TypeFieldParams,
  cache?: TypeCache,
  out?: Uint8Array,
  lanesOut?: Uint8Array,
  liftOut?: Float32Array,
): Uint8Array {
  const size = gridW * gridH
  const { time, baseHue, sessionSeed = 0 } = params
  const index = waveIndexAt(time)
  const seed = waveSeed(sessionSeed, index)
  const localTime = waveLocalTime(time)
  const c =
    cache && cache.gridW === gridW && cache.gridH === gridH && cache.seed === seed
      ? cache
      : createTypeCache(gridW, gridH, seed)
  const field = out && out.length >= size ? out : new Uint8Array(size)
  const lanes = lanesOut && lanesOut.length >= size ? lanesOut : new Uint8Array(size)
  const lifts = liftOut && liftOut.length >= size ? liftOut : undefined
  field.fill(0) // 复用缓冲清零：OFF 格零渲染
  lifts?.fill(0)

  for (let i = 0; i < size; i++) {
    if (c.corridor[i] === 0) continue // 对角走廊外：永不点亮（不漫入表单区）
    if (c.takePart[i] === 0) continue // 不是每个方块：仅参与率内的格子泛起淡流光
    const base = fireBase(c.u[i], c.jitter[i])
    if (localTime < base || localTime - base >= WAVE_DWELL_SECONDS) continue
    field[i] = 1
    lanes[i] = hueLaneIndex(typeHue(c.hueSeed[i], time, baseHue))
    if (lifts) lifts[i] = letterpressLift(localTime - base) * c.terrain[i]
  }
  return field
}
