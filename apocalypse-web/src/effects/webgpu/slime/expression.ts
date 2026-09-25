/** Adapted from yuanyang749/softie-webgpu, MIT, Copyright (c) 2026 yuanyang749.
 * Source: https://github.com/yuanyang749/softie-webgpu/tree/977a60844ac6ffe6824531900cf15bd5403e408f
 * Changes: TypeScript, Apocalypse host/lifecycle integration. See public/licenses/softie-webgpu.txt.
 */
import type { OrbState } from '@/effects/PixelOrb/types'
import { FACE_X } from './shape'
import type { FacePose } from './face-motion'
import { frontSurfaceZ } from './shape'

/** Authentication and password privacy override every transient play reaction. */
export function hostPose(play: FacePose, host: OrbState): FacePose {
  if (host === 'idle') return play
  return {
    surprised: host === 'waiting' ? 1 : 0,
    happy: host === 'success' ? 1 : 0,
    squish: 0,
    wink: 0,
    dizzy: 0,
    blink: host === 'sleeping' ? 0.95 : 0,
    gazeX: 0,
    gazeY: 0,
  }
}
export function poseFacePoint(
  i: number,
  restFace: Float32Array,
  eyeVertices: number,
  mouthTarget: Float32Array,
  faceDepth: Float32Array,
  mouthDepth: Float32Array,
  expression: FacePose,
  time: number,
  host: OrbState,
  posed: Float32Array,
) {
  const n = i * 3
  let x = restFace[n],
    y = restFace[n + 1],
    depth = faceDepth[i]
  if (i < eyeVertices * 2) {
    const left = i < eyeVertices,
      cx = FACE_X + (left ? -0.53 : 0.53)
    const dizzy = expression.dizzy ?? 0
    const spinAngle = time * 18
    const orbitR = 0.042 * dizzy
    const eyeOffsetX = (left ? Math.cos(spinAngle) : Math.cos(-spinAngle + Math.PI * 0.5)) * orbitR
    const eyeOffsetY = (left ? Math.sin(spinAngle) : Math.sin(-spinAngle + Math.PI * 0.5)) * orbitR
    const wobbleScaleX = 1 + Math.sin(spinAngle * 2 + (left ? 0 : Math.PI)) * 0.28 * dizzy
    const wobbleScaleY = 1 - Math.sin(spinAngle * 2 + (left ? 0 : Math.PI)) * 0.28 * dizzy

    const closed = Math.max(
      expression.blink,
      (1 - dizzy) * expression.squish * 0.9,
      expression.happy * 0.7,
      left ? expression.wink * 0.94 : 0,
    )
    const localX = (x - cx) * wobbleScaleX
    x = cx + eyeOffsetX + localX * (1 + expression.surprised * 0.12) + expression.gazeX * 0.05
    y =
      1.62 +
      eyeOffsetY +
      (y - 1.62) * (1 - closed) * wobbleScaleY * (1 + expression.surprised * 0.14) +
      closed * 0.025 * (1 - (localX / 0.112) ** 2) +
      expression.gazeY * 0.028
  } else {
    const m = (i - eyeVertices * 2) * 3
    const open = expression.surprised
    const dizzy = expression.dizzy ?? 0
    x += (mouthTarget[m] - x) * open
    y += (mouthTarget[m + 1] - y) * open
    depth += (mouthDepth[m / 3] - depth) * open
    const localX = x - FACE_X
    x = FACE_X + localX * (1 + expression.happy * 0.25 + expression.squish * 0.1)
    y = 1.535 + (y - 1.535) * (1 + expression.happy * 0.2) + expression.wink * localX * 0.16
    y += Math.sin(localX * 42 + time * 20) * 0.024 * dizzy - 0.015 * dizzy
  }
  if (host === 'error' && i >= eyeVertices * 2) y = 2 * 1.5 - y
  posed[n] = x
  posed[n + 1] = y
  posed[n + 2] = frontSurfaceZ(x, y) + depth
}
