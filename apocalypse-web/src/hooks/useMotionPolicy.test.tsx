import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMotionPolicy } from './useMotionPolicy'

const mockUseReducedMotion = vi.fn<() => boolean | null>(() => false)
const mockUseSettings = vi.fn(() => ({ motionEnabled: true }))

vi.mock('motion/react', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}))

vi.mock('@/stores/settings', () => ({
  useSettings: () => mockUseSettings(),
}))

function TestComponent({
  onPolicy,
}: {
  onPolicy: (policy: ReturnType<typeof useMotionPolicy>) => void
}) {
  const policy = useMotionPolicy()
  onPolicy(policy)
  return <div data-motion-active={policy.motionActive} />
}

describe('useMotionPolicy', () => {
  beforeEach(() => {
    mockUseSettings.mockReturnValue({ motionEnabled: true })
    mockUseReducedMotion.mockReturnValue(false)
  })

  it('默认情况下动效处于激活状态', () => {
    let captured: ReturnType<typeof useMotionPolicy> | undefined
    const html = renderToStaticMarkup(
      <TestComponent
        onPolicy={(p) => {
          captured = p
        }}
      />,
    )

    expect(html).toContain('data-motion-active="true"')
    expect(captured).toEqual({
      motionActive: true,
      motionEnabled: true,
      reducedMotion: false,
    })
  })

  it('用户在设置中关闭动效时，motionActive 为 false', () => {
    mockUseSettings.mockReturnValue({ motionEnabled: false })
    let captured: ReturnType<typeof useMotionPolicy> | undefined
    const html = renderToStaticMarkup(
      <TestComponent
        onPolicy={(p) => {
          captured = p
        }}
      />,
    )

    expect(html).toContain('data-motion-active="false"')
    expect(captured?.motionActive).toBe(false)
    expect(captured?.motionEnabled).toBe(false)
  })

  it('系统开启 prefers-reduced-motion 时，motionActive 为 false', () => {
    mockUseReducedMotion.mockReturnValue(true)
    let captured: ReturnType<typeof useMotionPolicy> | undefined
    const html = renderToStaticMarkup(
      <TestComponent
        onPolicy={(p) => {
          captured = p
        }}
      />,
    )

    expect(html).toContain('data-motion-active="false"')
    expect(captured?.motionActive).toBe(false)
    expect(captured?.reducedMotion).toBe(true)
  })
})
