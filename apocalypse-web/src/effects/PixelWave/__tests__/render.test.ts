/**
 * PixelWave 渲染契约（v2.9，docs/pixel-wave-spec.md §21）：
 * 只画 ON 格（field === 1），每格 = 半透软填充（alpha = WAVE_FILL_ALPHA）+
 * 4 条淡彩边框（alpha = WAVE_BORDER_ALPHA，厚度 blockSize/10 夹下限 2）；
 * 按 hue 道分桶设色（每道至多一次 fillStyle 赋值）、空道不设色不绘制、
 * 结束后 globalAlpha 复位。node 环境无 Canvas，用最小 stub 记录调用。
 */

import { describe, expect, it } from 'vitest'

import {
  renderLetterpressField,
  renderTypeField,
  LETTERPRESS_GLOW_ALPHA,
  LETTERPRESS_HALO_ALPHA,
  LETTERPRESS_SIDE_DEPTH_ALPHA,
  WAVE_BORDER_ALPHA,
  WAVE_FILL_ALPHA,
} from '..'
import type { LetterpressPalette } from '..'

interface RectCall {
  x: number
  y: number
  w: number
  h: number
  alpha: number
  style: string
}

class StubCtx {
  #fillStyle = ''
  globalAlpha = 1
  readonly styleSets: string[] = []
  readonly rects: RectCall[] = []
  get fillStyle(): string {
    return this.#fillStyle
  }
  set fillStyle(value: string) {
    this.#fillStyle = value
    this.styleSets.push(value)
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, alpha: this.globalAlpha, style: this.#fillStyle })
  }
}

function createStubCtx() {
  const stub = new StubCtx()
  return {
    ctx: stub as unknown as CanvasRenderingContext2D,
    rects: stub.rects,
    styleSets: stub.styleSets,
  }
}

const COLORS = ['lane-a', 'lane-b', 'lane-c']
const LETTERPRESS_PALETTE: LetterpressPalette = {
  face: 'paper',
  sideTop: 'gray-a',
  sideBottom: 'gray-b',
}

describe('renderTypeField（§19 彩色淡流光分桶绘制）', () => {
  it('只画 ON 格：OFF 格不绘制；每个 ON 格 = 1 软填充 + 4 边框', () => {
    const { ctx, rects } = createStubCtx()
    const field = new Uint8Array([0, 1, 0, 1])
    const lanes = new Uint8Array([0, 0, 0, 0])
    renderTypeField(ctx, field, lanes, 2, 2, 4, 4, COLORS)
    expect(rects).toHaveLength(10) // 2 个 ON 格 × 5 条
  })

  it('淡流光几何与透明度：软填充半透、边框略实，四边落位精确', () => {
    const { ctx, rects } = createStubCtx()
    const field = new Uint8Array([0, 1, 0, 0])
    const lanes = new Uint8Array(4)
    renderTypeField(ctx, field, lanes, 2, 2, 4, 4, COLORS)
    // 格 (1,0)：px=8, py=0, block=4, border=max(2, round(4/10))=2
    expect(rects).toEqual([
      { x: 8, y: 0, w: 4, h: 4, alpha: WAVE_FILL_ALPHA, style: 'lane-a' }, // 软填充
      { x: 8, y: 0, w: 4, h: 2, alpha: WAVE_BORDER_ALPHA, style: 'lane-a' }, // 上
      { x: 8, y: 2, w: 4, h: 2, alpha: WAVE_BORDER_ALPHA, style: 'lane-a' }, // 下
      { x: 8, y: 0, w: 2, h: 4, alpha: WAVE_BORDER_ALPHA, style: 'lane-a' }, // 左
      { x: 10, y: 0, w: 2, h: 4, alpha: WAVE_BORDER_ALPHA, style: 'lane-a' }, // 右
    ])
    expect(ctx.globalAlpha).toBe(1) // 结束后复位
    expect(WAVE_FILL_ALPHA).toBeLessThan(WAVE_BORDER_ALPHA) // 填充比边框更淡
  })

  it('大块加粗边框：block=40 时厚度 4（block/10）', () => {
    const { ctx, rects } = createStubCtx()
    const field = new Uint8Array([1])
    const lanes = new Uint8Array([0])
    renderTypeField(ctx, field, lanes, 1, 1, 40, 5, COLORS)
    expect(rects[0]).toMatchObject({ x: 0, y: 0, w: 40, h: 40, alpha: WAVE_FILL_ALPHA }) // 软填充
    expect(rects[1]).toMatchObject({ x: 0, y: 0, w: 40, h: 4 }) // 上边：厚度 4
    expect(rects[2]).toMatchObject({ x: 0, y: 36, w: 40, h: 4 }) // 下边
    expect(rects[3]).toMatchObject({ x: 0, y: 0, w: 4, h: 40 }) // 左边
    expect(rects[4]).toMatchObject({ x: 36, y: 0, w: 4, h: 40 }) // 右边
  })

  it('按 hue 道分桶设色：每道至多设一次 fillStyle', () => {
    const { ctx, styleSets } = createStubCtx()
    // 格0→道0、格1→道2、格2→道0、格3→道1
    const field = new Uint8Array([1, 1, 1, 1])
    const lanes = new Uint8Array([0, 2, 0, 1])
    renderTypeField(ctx, field, lanes, 4, 1, 4, 4, COLORS)
    expect(styleSets).toEqual(['lane-a', 'lane-b', 'lane-c'])
  })

  it('空道（无格子命中）不设 fillStyle 不绘制', () => {
    const { ctx, rects, styleSets } = createStubCtx()
    const field = new Uint8Array([1])
    const lanes = new Uint8Array([1])
    renderTypeField(ctx, field, lanes, 1, 1, 4, 4, COLORS)
    expect(rects).toHaveLength(5)
    expect(rects[0].style).toBe('lane-b')
    expect(styleSets).toEqual(['lane-b'])
  })

  it('全部 OFF 时不产生任何绘制与设色（零渲染）', () => {
    const { ctx, rects, styleSets } = createStubCtx()
    const field = new Uint8Array(6)
    const lanes = new Uint8Array(6)
    renderTypeField(ctx, field, lanes, 3, 2, 4, 4, COLORS)
    expect(rects).toHaveLength(0)
    expect(styleSets).toHaveLength(0)
  })
})

describe('renderLetterpressField（§21 同底色铅字浮雕）', () => {
  it('先画两级灰阶侧壁，再以背景同色顶面覆盖连接处', () => {
    const { ctx, rects } = createStubCtx()
    renderLetterpressField(
      ctx,
      new Uint8Array([1]),
      new Float32Array([1]),
      new Uint8Array([0]),
      1,
      1,
      8,
      2,
      COLORS,
      LETTERPRESS_PALETTE,
    )

    expect(rects.slice(0, 3)).toEqual([
      { x: 0, y: -4, w: 8, h: 7, alpha: 1, style: 'gray-a' },
      { x: 0, y: 3, w: 8, h: 5, alpha: LETTERPRESS_SIDE_DEPTH_ALPHA, style: 'gray-b' },
      { x: 0, y: -12, w: 8, h: 8, alpha: 1, style: 'paper' },
    ])
  })

  it('彩色只出现在剪影外沿和线芯，顶面中央不染色', () => {
    const { ctx, rects } = createStubCtx()
    renderLetterpressField(
      ctx,
      new Uint8Array([1]),
      new Float32Array([1]),
      new Uint8Array([2]),
      1,
      1,
      8,
      2,
      COLORS,
      LETTERPRESS_PALETTE,
    )

    const glowRects = rects.filter((rect) => rect.style === 'lane-c')
    expect(glowRects).toHaveLength(8)
    expect(glowRects.slice(0, 4).every((rect) => rect.alpha === LETTERPRESS_HALO_ALPHA)).toBe(true)
    expect(glowRects.slice(4).every((rect) => rect.alpha === LETTERPRESS_GLOW_ALPHA)).toBe(true)
    expect(rects.filter((rect) => rect.style === 'paper')).toEqual([
      { x: 0, y: -12, w: 8, h: 8, alpha: 1, style: 'paper' },
    ])
    expect(ctx.globalAlpha).toBe(1)
  })

  it('OFF 格或零高度格不绘制', () => {
    const { ctx, rects } = createStubCtx()
    renderLetterpressField(
      ctx,
      new Uint8Array([0, 1]),
      new Float32Array([1, 0]),
      new Uint8Array(2),
      2,
      1,
      8,
      2,
      COLORS,
      LETTERPRESS_PALETTE,
    )
    expect(rects).toHaveLength(0)
  })
})
