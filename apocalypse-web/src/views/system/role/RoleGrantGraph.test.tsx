import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  computeGrantGraphGeometry,
  MIN_NODE_STEP,
  RoleGrantGraph,
  SPRING_NODE_BUDGET,
  type GrantNode,
} from './RoleGrantGraph'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; count?: number }) =>
      options?.defaultValue ?? key,
  }),
}))

describe('RoleGrantGraph dynamic geometry and motion budget', () => {
  it('expands SVG height and preserves >= 72px vertical spacing for 60 permission nodes', () => {
    const geometry = computeGrantGraphGeometry(60)
    const step = geometry.nodeY(1) - geometry.nodeY(0)
    expect(step).toBeGreaterThanOrEqual(MIN_NODE_STEP)
    expect(geometry.canvasHeight).toBeGreaterThanOrEqual(60 * MIN_NODE_STEP)
  })

  it('defines SPRING_NODE_BUDGET at 24 nodes', () => {
    expect(SPRING_NODE_BUDGET).toBe(24)
    const small = computeGrantGraphGeometry(6)
    expect(small.canvasHeight).toBe(510)
  })

  it('renders module filter toolbar when > 12 permissions span multiple modules', () => {
    const nodes: GrantNode[] = Array.from({ length: 16 }, (_, index) => {
      const moduleKey = index < 8 ? 'system' : 'calendar'
      return {
        id: String(index + 1),
        state: 'linked',
        configurable: true,
        definition: {
          id: String(index + 1),
          code: `${moduleKey}:item:action-${index}`,
          name: `Action ${index}`,
          description: null,
          moduleKey,
          resource: 'item',
          action: `action-${index}`,
          status: 1,
          lifecycle: 'ACTIVE',
          version: 1,
          supportedScopeOverrides: ['INHERIT_ROLE', 'ALL'],
          declarationSource: 'CODE',
          registered: true,
          referenceRoleCount: '1',
        },
      }
    })
    const html = renderToStaticMarkup(
      <RoleGrantGraph
        roleName="Admin"
        nodes={nodes}
        selectedId={null}
        editing={false}
        disabled={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    )
    expect(html).toContain('data-slot="grant-graph-module-filter"')
    expect(html).toContain('system')
    expect(html).toContain('calendar')
  })
})
