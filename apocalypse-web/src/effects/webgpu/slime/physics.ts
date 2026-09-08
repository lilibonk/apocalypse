/**
 * Bounded, fixed-step soft-body approximation. No renderer/DOM dependencies.
 * Bulk stretch preserves volume; a local pressure kernel displaces skin and face together.
 */
import type { Point3 } from './shape'

export const PHYSICS = {
  step: 1 / 120,
  maxDelta: 1 / 15,
  gravity: 4.5,
  maxLift: 0.52,
  maxSide: 0.28,
  maxSpeed: 2.8,
  maxDent: 0.34,
} as const

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export interface SlimePhysics {
  x: number
  y: number
  vx: number
  vy: number
  stretch: number
  stretchVelocity: number
  lean: number
  leanVelocity: number
  dent: number
  dentVelocity: number
  pressure: Point3
  normal: Point3
  pressed: boolean
  dragged: boolean
  targetX: number
  targetY: number
  elapsed: number
  remainder: number
  impacts: number
}

export function createPhysics(): SlimePhysics {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    stretch: 0,
    stretchVelocity: 0,
    lean: 0,
    leanVelocity: 0,
    dent: 0,
    dentVelocity: 0,
    pressure: { x: 0, y: 0.95, z: 1.02 },
    normal: { x: 0, y: 0, z: 1 },
    pressed: false,
    dragged: false,
    targetX: 0,
    targetY: 0,
    elapsed: 0,
    remainder: 0,
    impacts: 0,
  }
}

export function beginPress(state: SlimePhysics, point: Point3) {
  state.pressed = true
  state.dragged = false
  state.pressure = { ...point }
  const nx = point.x / 1.69
  const ny = (point.y - 0.9) / 0.95
  const nz = point.z / 1.04
  const length = Math.hypot(nx, ny, nz) || 1
  state.normal = { x: nx / length, y: ny / length, z: nz / length }
  state.targetX = state.x
  state.targetY = state.y
}

export function moveGrab(state: SlimePhysics, x: number, y: number) {
  if (!state.pressed || !Number.isFinite(x) || !Number.isFinite(y)) return
  state.dragged = true
  state.targetX = clamp(x, -PHYSICS.maxSide, PHYSICS.maxSide)
  state.targetY = clamp(y, 0, PHYSICS.maxLift)
}

/** Also used on pointercancel, lost capture, blur, and viewport suspension. */
export function releasePress(state: SlimePhysics) {
  state.pressed = false
  state.dragged = false
  state.vx = clamp(state.vx, -PHYSICS.maxSpeed, PHYSICS.maxSpeed)
  state.vy = clamp(state.vy, -PHYSICS.maxSpeed, PHYSICS.maxSpeed)
}

export function poke(state: SlimePhysics) {
  if (state.pressed) return
  state.stretchVelocity = -1.9
  state.vy = 0.95
  state.dentVelocity = 1.25
}

function integrate(state: SlimePhysics) {
  const dt = PHYSICS.step
  state.elapsed += dt
  const grabbing = state.pressed && state.dragged
  if (grabbing) {
    state.vx += ((state.targetX - state.x) * 145 - state.vx * 21) * dt
    state.vy += ((state.targetY - state.y) * 145 - state.vy * 21) * dt
  } else {
    state.vx += (-state.x * 18 - state.vx * 6) * dt
    state.vy -= PHYSICS.gravity * dt
  }
  state.x = clamp(state.x + state.vx * dt, -PHYSICS.maxSide, PHYSICS.maxSide)
  state.y = Math.min(PHYSICS.maxLift, state.y + state.vy * dt)
  if (state.y < 0) {
    const impact = Math.max(0, -state.vy)
    state.y = 0
    state.vy = impact > 0.25 ? impact * 0.25 : 0
    if (impact > 0.3) {
      state.stretchVelocity -= Math.min(2.2, impact * 0.75)
      state.impacts++
    }
  }

  const stretchTarget = grabbing ? 0.07 : state.pressed ? -0.035 : 0
  state.stretchVelocity += ((stretchTarget - state.stretch) * 100 - state.stretchVelocity * 9) * dt
  state.stretch = clamp(state.stretch + state.stretchVelocity * dt, -0.26, 0.15)
  const leanTarget = clamp(-state.vx * 0.065, -0.09, 0.09)
  state.leanVelocity += ((leanTarget - state.lean) * 105 - state.leanVelocity * 11) * dt
  state.lean = clamp(state.lean + state.leanVelocity * dt, -0.12, 0.12)

  const dentTarget = state.pressed ? (state.dragged ? 0.1 : PHYSICS.maxDent) : 0
  state.dentVelocity += ((dentTarget - state.dent) * 185 - state.dentVelocity * 13) * dt
  state.dent = clamp(state.dent + state.dentVelocity * dt, -0.065, 0.4)
}

export function advancePhysics(state: SlimePhysics, deltaSeconds: number) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
  state.remainder += Math.min(deltaSeconds, PHYSICS.maxDelta)
  while (state.remainder >= PHYSICS.step) {
    integrate(state)
    state.remainder -= PHYSICS.step
  }
}

/** Exact determinant = 1 for the bulk scale. Local pressure uses a broad compensating bulge. */
export function bulkScale(stretch: number) {
  const y = 1 + clamp(stretch, -0.26, 0.15)
  const radial = 1 / Math.sqrt(y)
  return { x: radial, y, z: radial }
}

/** Allocation-free in the rendering loop: callers supply a scratch output point. */
export function deformPoint(
  x: number,
  y: number,
  z: number,
  state: SlimePhysics,
  output: Point3,
  breathing = 0,
): Point3 {
  const dx = x - state.pressure.x
  const dy = y - state.pressure.y
  const dz = z - state.pressure.z
  const distance = (dx * dx) / 0.36 + (dy * dy) / 0.25 + (dz * dz) / 0.3
  const local = Math.exp(-distance * 2.2)
  const surround = Math.exp(-distance * 0.65) * (1 - local)
  const amount = state.dent
  const shiftedX = x - state.normal.x * amount * local + dx * amount * surround * 0.2
  const shiftedY = y - state.normal.y * amount * local + dy * amount * surround * 0.12
  const shiftedZ = z - state.normal.z * amount * local + z * amount * surround * 0.065
  const sy = 1 + clamp(state.stretch + breathing, -0.26, 0.15)
  const radial = 1 / Math.sqrt(sy)
  output.x = shiftedX * radial + state.lean * shiftedY
  output.y = Math.max(0.035, shiftedY * sy)
  output.z = shiftedZ * radial
  return output
}
