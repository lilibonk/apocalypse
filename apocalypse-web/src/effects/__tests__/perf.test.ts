/**
 * P10 FPS 采样判定纯函数契约（docs/pixel-wave-spec.md §10 / §12 P10）：
 * 1s 窗口滚动平均；持续 <30fps 达 2s 判定降级（latch）；
 * 恢复即重置累计；采样空洞（后台标签页 rAF 暂停）不误判。
 */

import { describe, expect, it } from 'vitest'

import {
  FPS_GAP_WINDOW_RATIO,
  FPS_SUSTAIN_MS,
  FPS_THRESHOLD,
  FPS_WINDOW_MS,
  createFpsSampler,
} from '../perf'

/** 以固定帧间隔喂 n 帧，返回逐帧判定结果（首帧时间戳从 startMs 起）。 */
function feed(stepMs: number, count: number, startMs = 0, sampler = createFpsSampler()) {
  const results: boolean[] = []
  for (let i = 0; i < count; i++) {
    results.push(sampler.tick(startMs + i * stepMs))
  }
  return { results, sampler }
}

describe('createFpsSampler 窗口平均', () => {
  it('首个窗口未闭合时不判定且 fps 为 null', () => {
    const sampler = createFpsSampler()
    expect(sampler.tick(0)).toBe(false)
    expect(sampler.tick(500)).toBe(false)
    expect(sampler.fps).toBeNull()
  })

  it('60fps 恒定：窗口平均 ≈60，永不降级', () => {
    const { results, sampler } = feed(1000 / 60, 600) // 10s
    expect(results.every((r) => r === false)).toBe(true)
    expect(sampler.fps).toBeGreaterThan(55)
    expect(sampler.fps).toBeLessThan(65)
  })

  it('约 30.3fps（33ms 间隔）：高于阈值不降级', () => {
    const { results } = feed(33, 300) // ~10s
    expect(results.every((r) => r === false)).toBe(true)
  })
})

describe('createFpsSampler 持续低帧判定（<30fps 持续 2s）', () => {
  it('20fps 恒定：第 2 个低帧窗口闭合时（t=2000ms）判定降级', () => {
    const sampler = createFpsSampler()
    const { results } = feed(50, 41, 0, sampler) // t = 0..2000ms
    expect(results[39]).toBe(false) // t=1950，低帧累计仅 1s
    expect(results[40]).toBe(true) // t=2000，低帧累计达 2s
    expect(sampler.fps).toBeLessThan(FPS_THRESHOLD)
  })

  it('判定后 latch：后续帧恒为 true', () => {
    const sampler = createFpsSampler()
    feed(50, 41, 0, sampler)
    expect(sampler.tick(2050)).toBe(true)
    expect(sampler.tick(99999)).toBe(true)
  })

  it('低帧 1s 后恢复 60fps：累计重置，不降级', () => {
    const sampler = createFpsSampler()
    expect(feed(50, 21, 0, sampler).results.every((r) => r === false)).toBe(true) // 1s 低帧
    const { results } = feed(1000 / 60, 300, 1016.7, sampler) // 恢复 5s
    expect(results.every((r) => r === false)).toBe(true)
  })

  it('低帧 1.5s 后恢复 60fps：滚动窗口被恢复帧稀释，不降级', () => {
    const sampler = createFpsSampler()
    // 1.5s 低帧（20fps）：t = 0..1450，第 1 窗口闭合累计 1s
    feed(50, 30, 0, sampler)
    // 恢复 60fps：第 2 窗口（t≈2000 闭合）被恢复帧稀释至 ~40fps，累计重置
    const { results } = feed(1000 / 60, 300, 1466.7, sampler)
    expect(results.every((r) => r === false)).toBe(true)
  })
})

describe('createFpsSampler 采样空洞保护', () => {
  it('长空洞窗口不判定、重置累计；空洞后低帧需重新累计 2s', () => {
    const sampler = createFpsSampler()
    // 1s 低帧（累计 1s），随后 5s 空洞（后台标签页 rAF 暂停）
    feed(50, 21, 0, sampler)
    expect(sampler.tick(6000)).toBe(false) // 空洞窗口：跳过判定，fps 置 null
    expect(sampler.fps).toBeNull()
    // 空洞后 20fps：t=6000 起重新累计，t=8000 才降级
    expect(feed(50, 39, 6050, sampler).results.every((r) => r === false)).toBe(true) // 至 7950
    expect(sampler.tick(8000)).toBe(true)
  })

  it('空洞倍率边界：窗口耗时 ≤ windowMs × 1.5 仍参与判定', () => {
    const sampler = createFpsSampler({ windowMs: 1000, sustainMs: 1400 })
    // 单窗口 1400ms 仅 2 帧（≈1.4fps）：1400 ≤ 1500，判定为低帧且累计达标
    expect(sampler.tick(0)).toBe(false)
    expect(sampler.tick(700)).toBe(false)
    expect(sampler.tick(1400)).toBe(true)
  })
})

describe('createFpsSampler 可配参数与常量', () => {
  it('自定义阈值/窗口/持续时长生效', () => {
    const sampler = createFpsSampler({ thresholdFps: 55, sustainMs: 1000, windowMs: 500 })
    // 50fps（20ms 间隔）：低于 55 阈值；两个 500ms 窗口（累计 1s）即降级
    const { results } = feed(20, 51, 0, sampler) // t = 0..1000
    expect(results[49]).toBe(false)
    expect(results[50]).toBe(true)
  })

  it('默认常量与 spec §10/§12 P10 建议值一致（<30fps 持续 2s，1s 窗口）', () => {
    expect(FPS_THRESHOLD).toBe(30)
    expect(FPS_SUSTAIN_MS).toBe(2000)
    expect(FPS_WINDOW_MS).toBe(1000)
    expect(FPS_GAP_WINDOW_RATIO).toBe(1.5)
  })
})
