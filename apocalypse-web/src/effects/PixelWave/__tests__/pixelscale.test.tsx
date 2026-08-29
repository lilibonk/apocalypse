import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PixelScale } from '..'

describe('PixelScale 渲染', () => {
  it('属于 PixelWave 家族并默认渲染 card 音阶', () => {
    const html = renderToStaticMarkup(<PixelScale />)
    expect(html).toContain('data-effect="pixel-wave"')
    expect(html).toContain('data-appearance="scale"')
    expect(html).toContain('data-variant="card"')
    expect(html.match(/data-slot="pixel-scale-bar"/g)).toHaveLength(12)
  })

  it('inline 规格渲染 6 根并可继承按钮文字色', () => {
    const html = renderToStaticMarkup(<PixelScale variant="inline" tone="current" />)
    expect(html.match(/data-slot="pixel-scale-bar"/g)).toHaveLength(6)
    expect(html).toContain('bg-current')
  })

  it('page 规格提供可访问的加载状态', () => {
    const html = renderToStaticMarkup(<PixelScale variant="page" label="页面加载中" />)
    expect(html.match(/data-slot="pixel-scale-bar"/g)).toHaveLength(16)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-label="页面加载中"')
  })

  it('可停驻为静态音阶', () => {
    expect(renderToStaticMarkup(<PixelScale active={false} />)).toContain('data-active="false"')
  })
})
