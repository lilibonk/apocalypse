import { describe, expect, it } from 'vitest'

import { clampZoom, fitView, panIntoView, zoomLimits } from './view'

describe('graph view', () => {
  it('fits large content within padding and centres it', () => {
    const view = fitView(800, 400, 1600, 400)
    expect(view.scale).toBeCloseTo((800 - 48) / 1600)
    expect(view.x).toBeCloseTo((800 - 1600 * view.scale) / 2)
  })

  it('never enlarges small content and clamps extreme zoom', () => {
    expect(fitView(800, 600, 200, 100).scale).toBe(1)
    expect(clampZoom(10)).toBe(zoomLimits.max)
    expect(clampZoom(0.01)).toBe(zoomLimits.min)
  })

  it('keeps oversized content readable, centred and top-aligned', () => {
    const view = fitView(800, 600, 3000, 1200, 24, 0.8)
    expect(view.scale).toBe(0.8)
    expect(view.x).toBeCloseTo((800 - 3000 * 0.8) / 2)
    expect(view.y).toBe(24)
  })

  it('pans the minimum needed to reveal a box and leaves visible boxes alone', () => {
    const view = { x: -500, y: 0, scale: 1 }
    expect(panIntoView(view, { x: 100, y: 100, width: 50, height: 20 }, 800, 600).x).toBe(-68)
    const visible = { x: 0, y: 0, scale: 1 }
    expect(panIntoView(visible, { x: 100, y: 100, width: 50, height: 20 }, 800, 600)).toBe(visible)
  })

  it('returns identity for unmeasured frames', () => {
    expect(fitView(0, 0, 100, 100)).toEqual({ x: 0, y: 0, scale: 1 })
  })
})
