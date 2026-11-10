import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { computeWindowedSlice, useWindowedRows } from './useWindowedRows'

function Probe({ count }: { count: number }) {
  const items = Array.from({ length: count }, (_, index) => ({ id: `row-${index}` }))
  const windowed = useWindowedRows(items)
  return createElement(
    'div',
    {
      'data-windowed': String(windowed.windowed),
      'data-visible-count': String(windowed.visibleRows.length),
      'data-bottom-spacer': String(windowed.bottomSpacerHeight),
    },
    windowed.visibleRows.map((item) => createElement('span', { key: item.id }, item.id)),
  )
}

describe('useWindowedRows', () => {
  it('renders all rows directly when count is at or below threshold (100)', () => {
    const html = renderToStaticMarkup(createElement(Probe, { count: 100 }))
    expect(html).toContain('data-windowed="false"')
    expect(html).toContain('data-visible-count="100"')
    expect(html).toContain('data-bottom-spacer="0"')
  })

  it('activates windowed slicing and spacer height when count exceeds threshold', () => {
    const html = renderToStaticMarkup(createElement(Probe, { count: 250 }))
    expect(html).toContain('data-windowed="true"')
    const visibleMatch = html.match(/data-visible-count="(\d+)"/)
    expect(Number(visibleMatch?.[1] ?? 999)).toBeLessThan(100)
    const bottomSpacerMatch = html.match(/data-bottom-spacer="(\d+)"/)
    expect(Number(bottomSpacerMatch?.[1] ?? 0)).toBeGreaterThan(0)

    const scrolled = computeWindowedSlice(
      Array.from({ length: 250 }, (_, index) => index),
      2200,
      { threshold: 100, rowHeight: 44, viewportHeight: 560, overscan: 10 },
    )
    expect(scrolled.windowed).toBe(true)
    expect(scrolled.topSpacerHeight).toBeGreaterThan(0)
    expect(scrolled.bottomSpacerHeight).toBeGreaterThan(0)
  })
})
