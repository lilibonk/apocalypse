import { describe, expect, it } from 'vitest'

import { createCircuitTraces, renderCircuitTraces, CIRCUIT_INITIAL_DELAY_SECONDS } from '..'

class CircuitCtxStub {
  globalAlpha = 1
  fillStyle = ''
  strokeStyle = ''
  lineCap: CanvasLineCap = 'butt'
  lineJoin: CanvasLineJoin = 'miter'
  lineWidth = 1
  strokes = 0
  nodes = 0
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {
    this.strokes += 1
  }
  fillRect() {
    this.nodes += 1
  }
}

describe('CRUD circuit traces', () => {
  it('每次生成同一套固定主路与不对称分支，而不是规则像素网格', () => {
    const first = createCircuitTraces(448, 596)
    const second = createCircuitTraces(448, 596)
    expect(first).toEqual(second)
    expect(first).toHaveLength(6)
    expect(first[0].points).toHaveLength(13)
    expect(first.slice(1).every((trace) => trace.delay > 0)).toBe(true)
    expect(first.slice(1).every((trace) => trace.travel < first[0].travel)).toBe(true)
  })

  it('首波前零绘制，传导期绘制低亮尾迹、高亮脉冲与端点', () => {
    const trace = createCircuitTraces(448, 596).slice(0, 1)
    const stub = new CircuitCtxStub()
    const ctx = stub as unknown as CanvasRenderingContext2D

    renderCircuitTraces(ctx, trace, CIRCUIT_INITIAL_DELAY_SECONDS - 0.01, 'mint')
    expect(stub.strokes).toBe(0)
    expect(stub.nodes).toBe(0)

    renderCircuitTraces(ctx, trace, CIRCUIT_INITIAL_DELAY_SECONDS + trace[0].delay + 1, 'mint')
    expect(stub.strokes).toBe(2)
    expect(stub.nodes).toBe(1)
    expect(stub.strokeStyle).toBe('mint')
    expect(stub.fillStyle).toBe('mint')
    expect(stub.globalAlpha).toBe(1)
  })
})
