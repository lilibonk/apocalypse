import { expect, it } from 'vitest'

import { resolveSlimeMode } from './mode'

it('只有可见、已确认允许动画的大角色才申请 GPU', () => {
  expect(resolveSlimeMode(384, true, true, true, false)).toBe('realtime')
  expect(resolveSlimeMode(256, true, true, true, false)).toBe('realtime')
})

it('初次可见性和 reduced-motion 检测期间留空，不闪静态占位也不申请 GPU', () => {
  expect(resolveSlimeMode(384, false, true, true, false)).toBe('pending')
  expect(resolveSlimeMode(384, true, true, true, null)).toBe('pending')
  expect(resolveSlimeMode(256, false, true, true, null)).toBe('pending')
  expect(resolveSlimeMode(384, true, true, null, false)).toBe('pending')
})

it('小尺寸或明确关闭动画才显示静态海报，包括尚未可见时', () => {
  expect(resolveSlimeMode(128, true, true, true, false)).toBe('static')
  expect(resolveSlimeMode(384, true, false, true, false)).toBe('static')
  expect(resolveSlimeMode(384, true, true, false, false)).toBe('static')
  expect(resolveSlimeMode(384, true, true, true, true)).toBe('static')
  expect(resolveSlimeMode(384, false, true, true, true)).toBe('static')
  expect(resolveSlimeMode(384, false, false, true, null)).toBe('static')
})
