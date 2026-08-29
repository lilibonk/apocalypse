/**
 * 把 7 个 pose 拼成一行 atlas.png（v4 调色），供人工对照与 DEFINITION 资产。
 * 每次跑本文件都会覆写 atlas.png；形状源仍是 draw.ts。
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it } from 'vitest'

import { SKINS } from '../skins'
import { composeFrame, N, type PoseId } from '../draw'
import { encodeRgbaPng } from '../png'

const POSES: PoseId[] = ['idle', 'blink', 'success', 'error', 'sleeping', 'flat', 'mini']

describe('dump atlas.png', () => {
  it('写入 7×64 条带', () => {
    const palette = SKINS.v4.palette
    const width = N * POSES.length
    const height = N
    const sheet = new Uint8ClampedArray(width * height * 4)
    POSES.forEach((pose, column) => {
      const frame = composeFrame({ pose, palette })
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const src = (y * N + x) * 4
          const dst = (y * width + column * N + x) * 4
          sheet[dst] = frame[src]
          sheet[dst + 1] = frame[src + 1]
          sheet[dst + 2] = frame[src + 2]
          sheet[dst + 3] = frame[src + 3]
        }
      }
    })
    const png = encodeRgbaPng(width, height, sheet)
    const dir = dirname(fileURLToPath(import.meta.url))
    writeFileSync(join(dir, '..', 'atlas.png'), png)
  })
})
