import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({ mountRealtime: false }))
vi.mock('./mode', async (original) => {
  const actual = await original<typeof import('./mode')>()
  return {
    resolveSlimeMode: (...args: Parameters<typeof actual.resolveSlimeMode>) =>
      lifecycle.mountRealtime ? 'realtime' : actual.resolveSlimeMode(...args),
  }
})

import { Slime } from './Slime'

afterEach(() => {
  lifecycle.mountRealtime = false
})

it('首次检测可见性与客户端偏好前保留尺寸，但不渲染占位角色', () => {
  const html = renderToStaticMarkup(<Slime size={384} />)
  expect(html).toContain('width:384px;height:384px')
  expect(html).toContain('data-presentation="pending"')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('<canvas')
})

it('进入实时分支后，代码加载/GPU 初始化期间仍无海报，画布保持隐藏', () => {
  // Mount the real realtime child in its initial state; effects/GPU do not run during SSR.
  lifecycle.mountRealtime = true
  const html = renderToStaticMarkup(<Slime size={384} />)
  expect(html).toContain('data-status="loading"')
  expect(html).toContain('<canvas')
  expect(html).toContain('data-ready="false"')
  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain('tabindex="-1"')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('class="slime-fallback"')
})
