import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { odometerColumns, odometerDelay } from './odometer'
import { OdometerNumber } from './OdometerNumber'

describe('odometer columns', () => {
  it('keys columns from the right so the units digit keeps its reel across digit-count changes', () => {
    const nine = odometerColumns('9')
    const ten = odometerColumns('10')
    expect(nine.at(-1)?.key).toBe(ten.at(-1)?.key)
    expect(ten.map((column) => column.digit)).toEqual([1, 0])
  })

  it('treats grouping, decimals, signs and units as static glyphs', () => {
    const columns = odometerColumns('-1,234.5%')
    expect(columns.filter((column) => column.digit === null).map((column) => column.char)).toEqual([
      '-',
      ',',
      '.',
      '%',
    ])
    expect(columns.filter((column) => column.digit !== null).map((column) => column.digit)).toEqual(
      [1, 2, 3, 4, 5],
    )
  })

  it('staggers reels from the right and never delays static glyphs', () => {
    const [first, separator, , , last] = odometerColumns('1,234')
    expect(odometerDelay(last, 0.03)).toBe(0)
    expect(odometerDelay(first, 0.03)).toBeCloseTo(0.12)
    expect(odometerDelay(separator, 0.03)).toBe(0)
  })

  it('exposes only the final formatted value to assistive technology', () => {
    const markup = renderToStaticMarkup(
      createElement(OdometerNumber, { formatted: '1,024', enabled: true }),
    )
    expect(markup).toContain('<span class="sr-only">1,024</span>')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toContain('data-instant')
    const instant = renderToStaticMarkup(
      createElement(OdometerNumber, { formatted: '7', enabled: false }),
    )
    expect(instant).toContain('data-instant')
    expect(instant).not.toContain('transition-delay')
  })
})
