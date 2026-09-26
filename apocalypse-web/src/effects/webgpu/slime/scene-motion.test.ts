import { readFileSync } from 'node:fs'

import { Texture, Vector3, type Renderer } from 'three/webgpu'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pmrem = vi.hoisted(() => ({
  textures: [] as ReturnType<typeof vi.fn>[],
  generators: [] as ReturnType<typeof vi.fn>[],
}))
vi.mock('three/webgpu', async (original) => {
  const actual = await original<typeof import('three/webgpu')>()
  return {
    ...actual,
    PMREMGenerator: class {
      dispose = vi.fn()
      constructor() {
        pmrem.generators.push(this.dispose)
      }
      fromScene() {
        const dispose = vi.fn()
        pmrem.textures.push(dispose)
        return { texture: new actual.Texture(), dispose }
      }
    },
  }
})

import { readSlimeColours } from './appearance'
import { SlimeGestures } from './gestures'
import { JellyPhysics } from './physics'
import { createSlimeScene } from './scene'
import { CROWN, FACE_MOUTH, frontSurfaceZ } from './shape'
import { skinUv } from './skin-projection'
import type { OrbState } from '@/effects/PixelOrb/types'
import type { Reaction } from './face-motion'

type View = ReturnType<typeof createSlimeScene>
const liveViews: View[] = []
const tokensCss = readFileSync(new URL('../../../design/tokens.css', import.meta.url), 'utf8')

function makeView(skinTexture?: Texture) {
  const root = tokensCss.split(':root {')[1]?.split('}')[0] ?? ''
  const tokens = new Map(
    [...root.matchAll(/(--slime-[\w-]+):\s*(#[\da-f]{6});/gi)].map(([, name, value]) => [
      name,
      value,
    ]),
  )
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => tokens.get(name) ?? '',
  }))
  const colours = readSlimeColours({} as Element)
  const physics = new JellyPhysics()
  const renderer = { setClearColor: vi.fn() } as unknown as Renderer
  const view = createSlimeScene(renderer, colours, physics, skinTexture)
  liveViews.push(view)
  return { physics, view }
}

function pose(view: View, state: OrbState, reaction?: Reaction) {
  view.faceMotion.reset(0)
  if (reaction) view.faceMotion.react(reaction)
  for (const time of [0.05, 0.1, 0.15]) view.update(time, state)
  return Float32Array.from(view.posed)
}

function largestMove(a: Float32Array, b: Float32Array) {
  let largest = 0
  for (let i = 0; i < a.length; i += 3)
    largest = Math.max(largest, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]))
  return largest
}

function expectFaceOnDeformedSkin(view: View, physics: JellyPhysics) {
  const positions = view.face.geometry.getAttribute('position')
  const out = { x: 0, y: 0, z: 0 }
  const surface = { x: 0, y: 0, z: 0 }
  const stride = Math.max(1, Math.floor(positions.count / 160))
  for (let i = 0; i < positions.count; i += stride) {
    const n = i * 3
    const x = view.posed[n],
      y = view.posed[n + 1],
      z = view.posed[n + 2]
    const front = frontSurfaceZ(x, y)
    expect([x, y, z, front].every(Number.isFinite)).toBe(true)
    expect(front).toBeGreaterThan(0)
    expect(Math.abs(z - front)).toBeLessThan(0.1)
    physics.deform(x, y, z, out)
    expect(
      Math.hypot(positions.getX(i) - out.x, positions.getY(i) - out.y, positions.getZ(i) - out.z),
    ).toBeLessThan(0.0001)
    physics.deform(x, y, front, surface)
    expect(
      Math.hypot(
        positions.getX(i) - surface.x,
        positions.getY(i) - surface.y,
        positions.getZ(i) - surface.z,
      ),
    ).toBeLessThan(0.12)
  }
}

afterEach(() => {
  for (const view of liveViews) view.dispose()
  liveViews.length = 0
  pmrem.textures = []
  pmrem.generators = []
  vi.unstubAllGlobals()
})

describe('Milk Cloud scene motion integration', () => {
  it('idle and every play or privacy expression remain finite and attached to the authored front skin', () => {
    const { physics, view } = makeView()
    const neutral = pose(view, 'idle')
    expectFaceOnDeformedSkin(view, physics)
    for (const reaction of ['surprised', 'happy', 'wink', 'dizzy'] as const) {
      const active = pose(view, 'idle', reaction)
      expect(largestMove(active, neutral)).toBeGreaterThan(0.015)
      expectFaceOnDeformedSkin(view, physics)
    }
    for (const state of ['sleeping', 'error'] as const) {
      const active = pose(view, state, 'dizzy')
      expect(largestMove(active, neutral)).toBeGreaterThan(0.015)
      expectFaceOnDeformedSkin(view, physics)
      expect(view.dizzyStars.visible).toBe(false)
    }
  })

  it('skinPosition stays at rest while the body and face follow the same local indentation field', () => {
    const { physics, view } = makeView()
    const position = view.body.geometry.getAttribute('position')
    const skin = view.body.geometry.getAttribute('skinPosition')
    expect(skin.count).toBe(position.count)
    const restSkin = Float32Array.from(skin.array)
    expect(restSkin).toEqual(view.bodyRest)
    const anchor = {
      x: FACE_MOUTH.x,
      y: FACE_MOUTH.y,
      z: frontSurfaceZ(FACE_MOUTH.x, FACE_MOUTH.y),
    }
    physics.beginGrab(anchor, anchor)
    for (let i = 0; i < 12; i++) physics.update(1 / 120)
    view.update(0.1, 'idle')
    expect(Float32Array.from(skin.array)).toEqual(restSkin)
    expect(largestMove(Float32Array.from(position.array), view.bodyRest)).toBeGreaterThan(0.02)
    expectFaceOnDeformedSkin(view, physics)
  })

  it('projects every body vertex to a finite in-bounds UV that stays fixed during deformation', () => {
    const texture = new Texture()
    const { physics, view } = makeView(texture)
    const position = view.body.geometry.getAttribute('position')
    const uv = view.body.geometry.getAttribute('uv')
    expect(uv.count).toBe(position.count)
    const initialPositions = Float32Array.from(position.array)
    const initialUv = Float32Array.from(uv.array)
    let minU = Infinity,
      minV = Infinity,
      maxU = -Infinity,
      maxV = -Infinity
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i),
        v = uv.getY(i)
      expect(Number.isFinite(u) && Number.isFinite(v)).toBe(true)
      minU = Math.min(minU, u)
      minV = Math.min(minV, v)
      maxU = Math.max(maxU, u)
      maxV = Math.max(maxV, v)
      if (i % 41 === 0) {
        const mapped = skinUv(view.bodyRest[i * 3], view.bodyRest[i * 3 + 1])
        expect(u).toBeCloseTo(mapped.u, 6)
        expect(v).toBeCloseTo(mapped.v, 6)
      }
    }
    expect(minU).toBeGreaterThanOrEqual(0)
    expect(maxU).toBeLessThanOrEqual(1)
    expect(minV).toBeGreaterThanOrEqual(0)
    expect(maxV).toBeLessThanOrEqual(1)

    const anchor = {
      x: FACE_MOUTH.x,
      y: FACE_MOUTH.y,
      z: frontSurfaceZ(FACE_MOUTH.x, FACE_MOUTH.y),
    }
    physics.beginGrab(anchor, anchor)
    physics.moveGrab({ x: anchor.x + 0.3, y: anchor.y + 0.5, z: anchor.z })
    for (let i = 0; i < 12; i++) physics.update(1 / 120)
    view.update(0.1, 'idle')
    expect(largestMove(Float32Array.from(position.array), initialPositions)).toBeGreaterThan(0.02)
    expect(Float32Array.from(uv.array)).toEqual(initialUv)
  })

  it('shake landing reveals exactly five stars whose halo follows the deformed crown during a hop', () => {
    const { physics, view } = makeView()
    const gestures = new SlimeGestures()
    gestures.begin(320, 320, 0, 640)
    for (const [i, x] of [440, 200, 440, 200, 320].entries()) gestures.move(x, 320, (i + 1) * 50)
    expect(gestures.release(280)).toBe('landing')
    physics.position.y = 1
    let time = 0
    for (let i = 0; i < 100; i++) {
      const clock = 300 + (i * 1000) / 60
      physics.update(1 / 60)
      if (gestures.update(clock, physics.position.y)) view.faceMotion.react('dizzy')
      time += 1 / 60
      view.update(time, 'idle')
      if (view.faceMotion.state.dizzy > 0.85) break
    }
    expect(view.faceMotion.expression).toBe('dizzy')
    expect(view.dizzyStars.visible).toBe(true)
    expect(view.stars).toHaveLength(5)
    expect(view.dizzyStars.children).toHaveLength(5)
    const crown = physics.deform(CROWN.x, CROWN.y, CROWN.z, { x: 0, y: 0, z: 0 })
    const offset = view.dizzyStars.position.clone().sub(new Vector3(crown.x, crown.y, crown.z))
    const worldHeight = view.actor.position.y + view.dizzyStars.position.y
    const starPositions = view.stars.map((star) => star.position.clone())
    expect(starPositions.every((star) => [star.x, star.y, star.z].every(Number.isFinite))).toBe(
      true,
    )
    expect(starPositions[0].distanceTo(starPositions[1])).toBeGreaterThan(0.05)

    const anchor = {
      x: FACE_MOUTH.x,
      y: FACE_MOUTH.y,
      z: frontSurfaceZ(FACE_MOUTH.x, FACE_MOUTH.y),
    }
    physics.beginGrab(anchor, anchor)
    physics.moveGrab({ x: anchor.x, y: anchor.y + 1, z: anchor.z })
    for (let i = 0; i < 12; i++) physics.update(1 / 120)
    view.update(time + 0.1, 'idle')
    const raised = physics.deform(CROWN.x, CROWN.y, CROWN.z, { x: 0, y: 0, z: 0 })
    expect(
      view.dizzyStars.position
        .clone()
        .sub(new Vector3(raised.x, raised.y, raised.z))
        .distanceTo(offset),
    ).toBeLessThan(0.0001)
    expect(view.actor.position.y + view.dizzyStars.position.y).toBeGreaterThan(worldHeight + 0.1)
  })

  it('disposes the active body, face, bubbles, stars and baked environment exactly once', () => {
    const texture = new Texture()
    const skinDispose = vi.spyOn(texture, 'dispose')
    const { view } = makeView(texture)
    const resources = [
      view.body.geometry,
      view.body.material,
      view.face.geometry,
      view.face.material,
      view.bubbles.geometry,
      view.bubbles.material,
      view.stars[0].geometry,
      view.stars[0].material,
    ]
    const disposals = resources.map((resource) => vi.spyOn(resource, 'dispose'))
    expect(view.scene.environment).toBeInstanceOf(Texture)
    view.dispose()
    view.dispose()
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce()
    expect(skinDispose).toHaveBeenCalledOnce()
    expect(pmrem.textures).toHaveLength(1)
    expect(pmrem.textures[0]).toHaveBeenCalledOnce()
    expect(pmrem.generators).toHaveLength(1)
    expect(pmrem.generators[0]).toHaveBeenCalledOnce()
  })
})
