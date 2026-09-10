import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint()
const violations = async (code: string, filePath: string) => {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports')
}

describe('WebGPU 引擎分域自动执法', () => {
  it('只在角色几何文件允许两个命名 helper；不能扩大到其他入口或文件', async () => {
    const file = 'src/effects/webgpu/slime/scene.ts'
    const helper = 'three/addons/utils/BufferGeometryUtils.js'
    expect(
      await violations(`import { mergeVertices, mergeGeometries } from '${helper}'`, file),
    ).toHaveLength(0)
    expect(
      await violations(
        `import { mergeVertices } from '${helper}'`,
        'src/effects/webgpu/slime/probe.ts',
      ),
    ).not.toHaveLength(0)
    for (const code of [
      `import * as helpers from '${helper}'`,
      `import helper from '${helper}'`,
      `import { mergeAttributes } from '${helper}'`,
      `export * from '${helper}'`,
      "import { OrbitControls } from 'three/addons/controls/OrbitControls.js'",
      "import { WebGLRenderer } from 'three'",
      "import { WebGPURenderer } from 'three/webgpu'",
      "import * as THREE from 'three/webgpu'",
      "import WebGLBackend from 'three/src/renderers/webgl-fallback/WebGLBackend.js'",
    ])
      expect((await violations(code, file)).length, code).toBeGreaterThan(0)
  })
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
