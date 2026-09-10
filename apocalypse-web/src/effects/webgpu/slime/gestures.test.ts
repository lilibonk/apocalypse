import { describe, expect, it } from 'vitest'
import { SlimeGestures } from './gestures'
import { FaceMotion } from './face-motion'
import { hostPose } from './expression'
import { JellyPhysics } from './physics'

const shake = (g: SlimeGestures, width = 640) => {
  const k = width / 640
  g.begin(320 * k, 320 * k, 0, width)
  for (const [i, x] of [440, 200, 440, 200, 320].entries()) g.move(x * k, 320 * k, (i + 1) * 50)
}
describe('交互分类与落地眩晕单时钟', () => {
  it('短点/长按区分；很长的直线快拖不误判摇晃', () => {
    const g = new SlimeGestures()
    g.begin(0, 0, 0, 640)
    expect(g.release(159)).toBe('poke')
    g.begin(0, 0, 0, 640)
    expect(g.release(160)).toBe('happy')
    g.begin(0, 0, 0, 640)
    for (let i = 1; i <= 8; i++) g.move(i * 100, 0, i * 30)
    expect(g.release(250)).toBe('happy')
    expect(g.land(260)).toBe(false)
  })
  it.each([640, 384, 256])('快速往返在 %i 舞台上等比例识别；只在松手后落地触发一次', (width) => {
    const g = new SlimeGestures()
    shake(g, width)
    expect(g.land(260)).toBe(false)
    expect(g.release(280)).toBe('landing')
    expect(g.update(300, 0.8)).toBe(false)
    expect(g.update(400, 0.05)).toBe(true)
    expect(g.land(410)).toBe(false)
  })
  it('取消、失焦及超时清理 pending，下一次正常点击不继承眩晕', () => {
    const g = new SlimeGestures()
    shake(g)
    g.cancel()
    expect(g.release(280)).toBeNull()
    expect(g.land(300)).toBe(false)
    shake(g)
    g.release(280)
    g.cancel()
    expect(g.land(500)).toBe(false)
    shake(g)
    g.release(280)
    expect(g.update(3000, 0)).toBe(false)
    expect(g.pendingLanding).toBe(false)
    g.begin(0, 0, 3010, 640)
    expect(g.release(3100)).toBe('poke')
  })
  it('真实重力落地接通眩晕，完整反应在 2.8 秒后淡出', () => {
    const g = new SlimeGestures(),
      p = new JellyPhysics(),
      f = new FaceMotion()
    let clock = 0
    p.onLand = () => {
      if (g.land(clock)) f.react('dizzy')
    }
    p.position.y = 1
    shake(g)
    expect(g.release(280)).toBe('landing')
    let sawDizzy = false
    for (let i = 0; i < 300; i++) {
      clock = 300 + (i * 1000) / 60
      p.update(1 / 60)
      if (g.update(clock, p.position.y)) f.react('dizzy')
      f.update(f.time + 1 / 60)
      sawDizzy ||= f.state.dizzy > 0.9
    }
    expect(sawDizzy).toBe(true)
    expect(f.expression).toBe('idle')
    expect(f.state.dizzy).toBe(0)
  })
  it('认证四状态遮蔽所有玩耍反应与 gaze；idle 保持源状态', () => {
    const f = new FaceMotion()
    f.react('dizzy')
    f.lookAt(1, 1)
    for (let i = 0; i < 30; i++) f.update(f.time + 1 / 60)
    expect(hostPose(f.state, 'idle')).toBe(f.state)
    for (const state of ['sleeping', 'waiting', 'success', 'error'] as const) {
      const pose = hostPose(f.state, state)
      expect(pose.dizzy).toBe(0)
      expect(pose.gazeX).toBe(0)
      expect(pose.gazeY).toBe(0)
    }
    expect(hostPose(f.state, 'sleeping').blink).toBe(0.95)
  })
})
