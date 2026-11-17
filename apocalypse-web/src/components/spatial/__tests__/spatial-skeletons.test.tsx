import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FloatingHud, ResponsiveInspector, SpatialStage, StickyCompactRailLayout } from '../index'

describe('Spatial Skeletons (Skeleton A & B)', () => {
  it('renders SpatialStage with backdrop, full-viewport flag, and corner FloatingHud slots', () => {
    const html = renderToStaticMarkup(
      <SpatialStage
        backdrop="dots"
        fullViewport
        hud={
          <>
            <FloatingHud slot="top-left" ariaLabel="角色路径导航">
              <span>超级管理员</span>
            </FloatingHud>
            <FloatingHud slot="right-inspector" ariaLabel="权限检视器">
              <span>授权详情</span>
            </FloatingHud>
          </>
        }
      >
        <div data-testid="canvas-content">Graph Canvas</div>
      </SpatialStage>,
    )

    expect(html).toContain('data-slot="spatial-stage"')
    expect(html).toContain('data-backdrop="dots"')
    expect(html).toContain('data-full-viewport="true"')
    expect(html).toContain('aria-label="角色路径导航"')
    expect(html).toContain('data-slot="top-left"')
    expect(html).toContain('floating-hud')
    expect(html).toContain('aria-label="权限检视器"')
    expect(html).toContain('data-slot="right-inspector"')
    expect(html).toContain('data-collapsible-narrow="true"')
  })

  it('renders StickyCompactRailLayout with structured items, dirty/conflict dots, and optional inspector', () => {
    const onSelect = vi.fn()
    const html = renderToStaticMarkup(
      <StickyCompactRailLayout
        railLabel="参数分组"
        items={[
          { key: 'sys.user', label: '用户管理', count: 3, dirty: true, dirtyCount: 1 },
          { key: 'sys.security', label: '安全策略', count: 2, conflict: true },
        ]}
        activeKey="sys.user"
        onSelect={onSelect}
        inspector={<div>选中项详情</div>}
        inspectorTitle="参数详情"
      >
        <div data-testid="fluid-stage">主舞台内容</div>
      </StickyCompactRailLayout>,
    )

    expect(html).toContain('data-slot="sticky-rail-layout"')
    expect(html).toContain('data-has-inspector="true"')
    expect(html).toContain('data-rail-width="compact"')
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('用户管理')
    expect(html).toContain('aria-label="参数详情"')
    expect(html).toContain('data-slot="responsive-inspector"')
  })

  it('supports ResponsiveInspector in inline mode without mounting a modal sheet', () => {
    const html = renderToStaticMarkup(
      <ResponsiveInspector title="内联检视" mode="inline">
        <p>内联内容</p>
      </ResponsiveInspector>,
    )
    expect(html).toContain('aria-label="内联检视"')
    expect(html).toContain('data-responsive-mode="inline"')
    expect(html).toContain('内联内容')
  })
})
