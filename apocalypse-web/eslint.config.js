import js from '@eslint/js'
import { globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Vite react-ts 模板标准 flat config；与 oxlint 并存（pnpm lint 串行跑两者）
export default tseslint.config([
  globalIgnores(['dist', 'dist-brand-qa', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      // 与 Vite 模板/oxlint 口径一致：fast refresh 边界提示降为 warn（shadcn ui 文件普遍混合导出）
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // —— AGENTS.md §5「引擎分域」执法（LIL-85：Three.js 仅允许 WebGPU 域）——
  // 一库一域，越域即违规：
  //   · GSAP → 仅品牌页（src/views/login/）与 src/effects/gsap/
  //   · Three.js → 仅 src/effects/webgpu/；WebGL / R3F / pixi / ogl 未获批准
  //   · 其余目录（views/ 与 components/ 等）只允许 CSS + motion（motion 不限制）
  // paths 拦裸包名，patterns 拦子路径深引用（minimatch：'three/*' 不跨层，须用 'three/**'）。
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['gsap', 'three', 'pixi.js', 'ogl'],
          patterns: [
            {
              group: ['gsap/**', 'three/**', '@react-three/**', 'pixi.js/**', 'ogl/**'],
              message:
                'AGENTS.md §5 引擎分域：GSAP 仅限品牌页/effects/gsap；Three.js 仅限 effects/webgpu；其余目录只消费封装组件。',
            },
          ],
        },
      ],
    },
  },
  {
    // GSAP 域：effects/gsap 与品牌页 views/login —— 放行 GSAP，WebGL 引擎仍禁
    files: ['src/effects/gsap/**/*.{ts,tsx}', 'src/views/login/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['three', 'pixi.js', 'ogl'],
          patterns: [
            {
              group: ['three/**', '@react-three/**', 'pixi.js/**', 'ogl/**'],
              message:
                'AGENTS.md §5 引擎分域：Three.js 仅限 src/effects/webgpu/，本目录只放行 GSAP。',
            },
          ],
        },
      ],
    },
  },
  {
    // 唯一 3D 域：显式 WebGPUBackend，不能悄悄走 WebGL fallback。
    files: ['src/effects/webgpu/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'gsap',
            'three',
            'pixi.js',
            'ogl',
            {
              name: 'three/webgpu',
              importNames: ['WebGPURenderer', 'WebGLBackend', 'WebGLRenderer'],
              message: 'LIL-85：使用 Renderer + WebGPUBackend，禁止隐式 WebGL 回退构造器。',
            },
          ],
          patterns: [
            {
              group: [
                'gsap/**',
                '@react-three/**',
                'pixi.js/**',
                'ogl/**',
                'three/**',
                '!three/webgpu',
                '!three/tsl',
              ],
              message:
                'AGENTS.md §5：本域只允许 Three.js 公共 WebGPU/TSL 入口，不允许 WebGL 或额外引擎。',
            },
          ],
        },
      ],
    },
  },
])
