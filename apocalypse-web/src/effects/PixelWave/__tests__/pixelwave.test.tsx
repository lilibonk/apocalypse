/**
 * PixelWave 组件烟测：barrel 导出 + v2.4 契约用法 SSR 渲染不报错、
 * 容器恒 pointer-events-none（v2.3 移除交互：无 interactive prop、
 * 无任何 pointer/window 监听）。SSR 下 useEffect 不执行，仅验证标记结构；
 * 像素传导场/渲染逻辑见 wave/render 测试。
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PixelWave } from '..'

describe('PixelWave 渲染', () => {
  it('无 props 默认渲染出 canvas', () => {
    expect(renderToStaticMarkup(<PixelWave />)).toContain('<canvas')
  })

  it('v2.4 契约用法（§16）：三处挂载点渲染不报错', () => {
    // 登录页品牌舞台（填充模式铅字浮雕）
    expect(
      renderToStaticMarkup(
        <PixelWave appearance="letterpress" waveSpeed={0.8} className="absolute inset-0 z-0" />,
      ),
    ).toContain('data-appearance="letterpress"')
    // PageLoading 28×6 矮条
    expect(renderToStaticMarkup(<PixelWave cols={28} rows={6} waveSpeed={1.5} />)).toContain(
      '<canvas',
    )
    // DynaTable 空状态 8×8 慢速
    expect(
      renderToStaticMarkup(
        <PixelWave cols={8} rows={8} waveSpeed={0.2} className="absolute inset-0" />,
      ),
    ).toContain('<canvas')
  })

  it('默认保持 flowlight，登录可显式选择 letterpress', () => {
    expect(renderToStaticMarkup(<PixelWave />)).toContain('data-appearance="flowlight"')
    expect(renderToStaticMarkup(<PixelWave appearance="letterpress" />)).toContain(
      'data-appearance="letterpress"',
    )
  })

  it('容器恒 pointer-events-none（canvas 永不挡交互）', () => {
    expect(renderToStaticMarkup(<PixelWave />)).toContain('pointer-events-none')
    expect(renderToStaticMarkup(<PixelWave className="absolute inset-0" />)).toContain(
      'pointer-events-none',
    )
  })
})
