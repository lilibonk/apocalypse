import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  CoupledMotionGroup,
  FlipExpandCard,
  FlipExpandGrid,
  HudTransition,
  MetricValue,
  OriginAnchor,
  PathPulse,
  PulseIndicator,
  useCoupledMotion,
} from '../index'

function CoupledProbe() {
  const { activeOriginId, pulseSeq, motionAllowed } = useCoupledMotion()
  return (
    <div>
      <span data-testid="origin">{activeOriginId ?? 'none'}</span>
      <span data-testid="seq">{pulseSeq}</span>
      <span data-testid="motion">{String(motionAllowed)}</span>
      <OriginAnchor originId="node-1" active>
        Node 1
      </OriginAnchor>
    </div>
  )
}

describe('Five-Channel Coupled Motion Primitives', () => {
  it('renders CoupledMotionGroup and OriginAnchor with causal origin attributes', () => {
    const html = renderToStaticMarkup(
      <CoupledMotionGroup initialOriginId="node-1">
        <CoupledProbe />
      </CoupledMotionGroup>,
    )

    expect(html).toContain('<span data-testid="origin">node-1</span>')
    expect(html).toContain('<span data-testid="seq">0</span>')
    expect(html).toContain('data-slot="origin-anchor"')
    expect(html).toContain('data-origin-id="node-1"')
    expect(html).toContain('data-origin-active="true"')
  })

  it('enforces MetricValue tiering: tabular mounts zero odometer reels while hero-odometer mounts OdometerNumber', () => {
    const tabularHtml = renderToStaticMarkup(
      <MetricValue value={1284} variant="tabular" suffix=" 次" />,
    )
    expect(tabularHtml).toContain('data-slot="metric-value"')
    expect(tabularHtml).not.toContain('odometer-reel')
    expect(tabularHtml).toContain('1,284 次')

    const heroHtml = renderToStaticMarkup(
      <MetricValue value={1284} variant="hero-odometer" suffix=" 次" motionEnabled={false} />,
    )
    expect(heroHtml).toContain('class="odometer"')
    expect(heroHtml).toContain('odometer-reel')
    expect(heroHtml).toContain('1,284 次')
  })

  it('renders PathPulse, FlipExpandGrid/Card, HudTransition, and PulseIndicator cleanly', () => {
    const html = renderToStaticMarkup(
      <div>
        <svg>
          <PathPulse d="M0 0 L100 100" active triggerKey={2} tone="purple" />
        </svg>
        <FlipExpandGrid>
          <FlipExpandCard
            id="sys_user_sex"
            expanded
            summary={<span>sys_user_sex</span>}
            expandedContent={<div>Expanded Rows</div>}
          />
        </FlipExpandGrid>
        <HudTransition entityKey="role-1">
          <span>Inspector Body</span>
        </HudTransition>
        <PulseIndicator variant="inline" tone="current" label="加载中" />
      </div>,
    )

    expect(html).toContain('data-slot="path-pulse"')
    expect(html).toContain('data-tone="purple"')
    expect(html).toContain('data-slot="flip-expand-card"')
    expect(html).toContain('data-expanded="true"')
    expect(html).toContain('Expanded Rows')
    expect(html).toContain('Inspector Body')
    expect(html).toContain('aria-label="加载中"')
  })
})
