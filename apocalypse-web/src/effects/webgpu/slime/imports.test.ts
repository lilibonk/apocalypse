import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint()
const violations = async (code: string, filePath: string) => {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports')
}

describe('WebGPU 引擎分域自动执法', () => {
  it('业务页不能直接引入 Three.js', async () => {
    expect(
      await violations("import { Renderer } from 'three/webgpu'", 'src/views/login/probe.ts'),
    ).toHaveLength(1)
  })
  it('引擎域只允许公共 WebGPU/TSL，禁止隐式 WebGL fallback', async () => {
    const file = 'src/effects/webgpu/slime/probe.ts'
    expect(
      await violations("import { Renderer, WebGPUBackend } from 'three/webgpu'", file),
    ).toHaveLength(0)
    expect(await violations("import { uniform } from 'three/tsl'", file)).toHaveLength(0)
    for (const code of [
      "import { WebGPURenderer } from 'three/webgpu'",
      "import * as THREE from 'three/webgpu'",
      "import { WebGLRenderer } from 'three'",
      "import WebGLBackend from 'three/src/renderers/webgl-fallback/WebGLBackend.js'",
    ])
      expect((await violations(code, file)).length).toBeGreaterThan(0)
  })
})
