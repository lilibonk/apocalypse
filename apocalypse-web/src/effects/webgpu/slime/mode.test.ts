import { expect, it } from 'vitest'

import { shouldUseRealtime } from './mode'

it('小尺寸、离屏、全局动画关闭、DOM 开关与 reduced-motion/SSR 均不申请 GPU', () => {
  expect(shouldUseRealtime(384, true, true, true, false)).toBe(true)
  expect(shouldUseRealtime(256, true, true, true, false)).toBe(true)
  expect(shouldUseRealtime(128, true, true, true, false)).toBe(false)
  expect(shouldUseRealtime(384, false, true, true, false)).toBe(false)
  expect(shouldUseRealtime(384, true, false, true, false)).toBe(false)
  expect(shouldUseRealtime(384, true, true, false, false)).toBe(false)
  expect(shouldUseRealtime(384, true, true, true, true)).toBe(false)
  expect(shouldUseRealtime(384, true, true, true, null)).toBe(false)
})
