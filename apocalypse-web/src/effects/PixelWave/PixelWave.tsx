/**
 * PixelWave —— 连续浪潮·活字浮雕氛围层（v2.11，docs/pixel-wave-spec.md §23）。
 *
 * 纯 Canvas 2D + rAF：默认 flowlight 保留稀疏方形环，登录 letterpress 改为与
 * 研究演示一致的完整 32px 铅字网格：每波从随机角点发射欧氏波前，快速抬升后
 * 以指数长尾连续回落，阈值以上 100% 格子参与，从而形成整片不同高度的柱体浪潮。
 * 每波都用新 seed 同步换新轮廓、点火、色相与高度纹理；顶面严格画成页面背景
 * （白底白块 / 黑底黑块），灰阶侧壁与彩色剪影流光只表达抬升。同一次挂载可由
 * session seed + 波序号复现，重新进入页面又会得到新形状。五彩程序化 oklch
 * （hue = --brand 基准 hue + hueSeed × 120° + 时间慢漂 ±10°，明暗两档 L/C，
 * CSS.supports 失败时整组回退 --brand）。letterpress 跟随 rAF 连续更新；其它
 * flowlight 表面仍按 ~10fps 离散步进。
 * CRUD 揭幕使用 circuit：在纯背景上缩放唯一一套固定 PCB 主路与不对称分支，
 * 品牌色脉冲在焊点处分流，不绘制规则网格、浮雕位移或灰阶侧壁。
 *
 * 网格布局：登录 letterpress fill 模式固定 32px 节距（28px 面 + 4px 缝）；
 * 默认 flowlight fill 模式仍按容器宽 48 等分；显式 cols/rows 维持原契约。
 * 写进 canvas 必须整数格（DEFINITION §1）。组件恒 pointer-events-none；
 * 无任何鼠标涟漪 / 点击脉冲 / 窗口监听（v2.3 移除交互）。
 *
 * 降级（AGENTS.md §5 双开关 + P10）：prefers-reduced-motion 或设置「动画」关闭
 * → 零渲染纯背景（清空画布，不起 rAF、不设观察者）；rAF 运行期持续低帧
 * （<30fps 达 2s，见 ../perf.ts）→ 清空画布定格纯背景、停 rAF、console.info 一次。
 */

import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

import { createFpsSampler } from '../perf'
import { createCircuitTraces, renderCircuitTraces } from './circuit'
import type { CircuitTrace } from './circuit'
import {
  oklchLaneColors,
  renderLetterpressField,
  renderTypeField,
  resolveBrandColor,
  resolveBrandHue,
  resolveLetterpressPalette,
  supportsOklch,
} from './render'
import {
  computeLetterpressField,
  computeTypeField,
  createLetterpressCache,
  createTypeCache,
  deriveGridCount,
  equalDivision,
  letterpressCorner,
  letterpressDivision,
  letterpressWaveIndexAt,
  stepTime,
  waveIndexAt,
  waveSeed,
  DEFAULT_BASE_HUE,
  HUE_LANES,
} from './wave'
import type { LetterpressCache, TypeCache } from './wave'

export interface PixelWaveProps {
  /** flowlight = 淡彩块；letterpress = 登录浮雕；circuit = CRUD 平面电路传导。 */
  appearance?: 'flowlight' | 'letterpress' | 'circuit'
  /** 网格列数；与 rows 同时缺省进入 fill 模式（按容器宽 48 等分切割方形大铅字块） */
  cols?: number
  /** 网格行数；与 cols 同时缺省进入 fill 模式 */
  rows?: number
  /** 像素块边长（CSS px，§5.1 基准 4；仅显式 cols/rows 时生效，fill 模式由等分切割决定） */
  blockSize?: number
  /** 块间隙（CSS px，§5.1 基准 4；仅显式 cols/rows 时生效） */
  gap?: number
  /** 速率倍率（1 = 规格速率；折入场时间轴，传导时长 / 发射间隔 / 点亮停留 / hue 慢漂同步缩放） */
  waveSpeed?: number
  /**
   * 尺寸类名（如登录页 absolute inset-0）。提供时尺寸以类名为准；
   * 缺省时容器取网格自然尺寸（显式 cols × rows 乘周期；fill 模式需配合类名使用）。
   */
  className?: string
}

export function PixelWave({
  appearance = 'flowlight',
  cols,
  rows,
  blockSize = 4,
  gap = 4,
  waveSpeed = 1,
  className,
}: PixelWaveProps) {
  const { motionEnabled } = useSettings()
  const reducedMotion = useReducedMotion()
  const staticMode = !motionEnabled || reducedMotion === true

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 显式模式的整数格归一化（DEFINITION §1）：块/隙/周期均为整数 px
  const block = Math.max(1, Math.round(blockSize))
  const gapSize = Math.max(0, Math.round(gap))
  const step = block + gapSize
  const naturalW = cols ? cols * step : 0
  const naturalH = rows ? rows * step : 0
  // fill 模式：cols/rows 同时缺省 → 等分切割方形大铅字块
  const fillMode = cols === undefined && rows === undefined

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const continuousAppearance = appearance === 'letterpress' || appearance === 'circuit'
    const ctx = canvas.getContext('2d', {
      alpha: !continuousAppearance,
      desynchronized: continuousAppearance,
    })
    if (!ctx) return

    // 每次组件挂载创建新的 session seed；每个周期再与波序号混合成独立噪声图。
    const seedWords = new Uint32Array(1)
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(seedWords)
    else seedWords[0] = Math.floor(Math.random() * 4294967296)
    const sessionSeed = seedWords[0]

    // —— 布局状态（ResizeObserver 推进；canvas 自适应父容器 + DPR）——
    let cssW = 1
    let cssH = 1
    let dpr = 1
    let gridW = 1
    let gridH = 1
    let blockEff = block
    let gapEff = gapSize
    let offsetX = 0
    let offsetY = 0
    let cache: TypeCache = createTypeCache(1, 1, waveSeed(sessionSeed, 0))
    let letterpressCache: LetterpressCache = createLetterpressCache(
      1,
      1,
      waveSeed(sessionSeed, 0),
      letterpressCorner(sessionSeed, 0),
    )
    let field = new Uint8Array(1)
    let lanes = new Uint8Array(1)
    let lifts = new Float32Array(1)
    let circuitTraces: CircuitTrace[] = []
    let lastStepped = Number.NaN // 上个已绘制的步进帧（NaN 强制首帧绘制）

    const measure = () => {
      const rect = wrap.getBoundingClientRect()
      cssW = Math.max(1, Math.round(rect.width))
      cssH = Math.max(1, Math.round(rect.height))
      // 与研究演示一致限制高分屏像素倍率，避免 3×/4× 屏无意义放大清屏成本。
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      if (fillMode) {
        // 登录忠实还原研究演示的固定 32px 铅字节距；其它表面保留 48 列等分。
        const div = continuousAppearance
          ? letterpressDivision(cssW, cssH)
          : equalDivision(cssW, cssH)
        gridW = div.gridW
        gridH = div.gridH
        blockEff = div.block
        gapEff = div.gap
      } else {
        gridW = deriveGridCount(cssW, step, cols)
        gridH = deriveGridCount(cssH, step, rows)
        blockEff = block
        gapEff = gapSize
      }
      const pitch = blockEff + gapEff
      cache = createTypeCache(gridW, gridH, waveSeed(sessionSeed, 0))
      letterpressCache = createLetterpressCache(
        gridW,
        gridH,
        waveSeed(sessionSeed, 0),
        letterpressCorner(sessionSeed, 0),
      )
      field = new Uint8Array(gridW * gridH)
      lanes = new Uint8Array(gridW * gridH)
      lifts = new Float32Array(gridW * gridH)
      circuitTraces = createCircuitTraces(cssW, cssH)
      // 网格在画布内整格居中（超出为负小量 → 对称裁切，视觉铺满）
      offsetX = Math.floor((cssW - gridW * pitch) / 2)
      offsetY = Math.floor((cssH - gridH * pitch) / 2)
      lastStepped = Number.NaN // 布局变化 → 下一步进帧强制重绘
    }

    // —— 五彩道色（程序化 oklch；accent / 明暗切换时经 MutationObserver 重解析）——
    let baseHue = DEFAULT_BASE_HUE
    let colors: readonly string[] = []
    let circuitColor = resolveBrandColor(wrap)
    let letterpressPalette = resolveLetterpressPalette(wrap)
    const refreshColors = () => {
      baseHue = resolveBrandHue(wrap) ?? DEFAULT_BASE_HUE
      colors = supportsOklch()
        ? oklchLaneColors(document.documentElement.classList.contains('dark'))
        : // oklch 不支持：整组回退 --brand，五彩退化为单色块（语言不塌）
          Array.from({ length: HUE_LANES }, () => resolveBrandColor(wrap))
      circuitColor = resolveBrandColor(wrap)
      letterpressPalette = resolveLetterpressPalette(wrap)
      lastStepped = Number.NaN // 道色变化 → 下一步进帧强制重绘
    }

    const clearCanvas = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (appearance === 'letterpress') {
        ctx.globalAlpha = 1
        ctx.fillStyle = letterpressPalette.face
        ctx.fillRect(0, 0, cssW, cssH)
      } else {
        ctx.clearRect(0, 0, cssW, cssH)
      }
    }

    measure()
    refreshColors()

    // 双开关降级：零渲染纯背景（天然满足），不起 rAF、不设观察者
    if (staticMode) {
      clearCanvas()
      return
    }

    const t0 = performance.now()

    // letterpress / circuit 每个 rAF 连续计算；flowlight 仍只在 10fps 步进边界计算。
    const paint = (frameTime: number) => {
      if (appearance === 'letterpress') {
        const index = letterpressWaveIndexAt(frameTime)
        if (index >= 0) {
          const seed = waveSeed(sessionSeed, index)
          const corner = letterpressCorner(sessionSeed, index)
          if (letterpressCache.seed !== seed || letterpressCache.corner !== corner) {
            letterpressCache = createLetterpressCache(gridW, gridH, seed, corner)
          }
        }
        computeLetterpressField(
          gridW,
          gridH,
          { time: frameTime, baseHue, sessionSeed },
          letterpressCache,
          field,
          lanes,
          lifts,
        )
      } else if (appearance === 'flowlight') {
        const seed = waveSeed(sessionSeed, waveIndexAt(frameTime))
        if (cache.seed !== seed) cache = createTypeCache(gridW, gridH, seed)
        computeTypeField(
          gridW,
          gridH,
          { time: frameTime, baseHue, sessionSeed },
          cache,
          field,
          lanes,
        )
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (continuousAppearance) {
        ctx.globalAlpha = 1
        ctx.fillStyle = letterpressPalette.face
        ctx.fillRect(0, 0, cssW, cssH)
      } else {
        ctx.clearRect(0, 0, cssW, cssH)
      }
      if (appearance === 'circuit') {
        renderCircuitTraces(ctx, circuitTraces, frameTime, circuitColor)
      } else {
        ctx.translate(offsetX, offsetY)
      }
      if (appearance === 'letterpress') {
        renderLetterpressField(
          ctx,
          field,
          lifts,
          lanes,
          gridW,
          gridH,
          blockEff,
          gapEff,
          colors,
          letterpressPalette,
        )
      } else if (appearance === 'flowlight') {
        renderTypeField(ctx, field, lanes, gridW, gridH, blockEff, gapEff, colors)
      }
    }

    const ro = new ResizeObserver(() => {
      measure()
    })
    ro.observe(wrap)

    const mo = new MutationObserver(refreshColors)
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-accent'],
    })

    // —— rAF 主循环（P10：FPS 采样；持续低帧 → 清空定格纯背景 + 停 rAF + console.info 一次）——
    let raf = 0
    const fps = createFpsSampler()
    const loop = (now: number) => {
      if (fps.tick(now)) {
        clearCanvas()
        console.info(
          `[PixelWave] 持续低帧（约 ${Math.round(fps.fps ?? 0)}fps < 30fps 达 2s），已自动降级为纯背景零渲染（docs/pixel-wave-spec.md §12 P10）`,
        )
        return
      }
      const timeline = ((now - t0) / 1000) * waveSpeed
      if (continuousAppearance) {
        // 参考实现逐 rAF 推进高度包络，避免 100ms 量化造成的台阶式跳动。
        paint(timeline)
      } else {
        const stepped = stepTime(timeline)
        if (stepped !== lastStepped) {
          lastStepped = stepped
          paint(stepped)
        }
      }
      raf = window.requestAnimationFrame(loop)
    }
    raf = window.requestAnimationFrame(loop)

    return () => {
      window.cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
    }
  }, [appearance, cols, rows, block, gapSize, step, waveSpeed, staticMode, fillMode])

  return (
    <div
      ref={wrapRef}
      className={cn('pointer-events-none', className)}
      style={className ? undefined : { width: naturalW, height: naturalH }}
      aria-hidden
      data-effect="pixel-wave"
      data-appearance={appearance}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
