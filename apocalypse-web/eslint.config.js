import js from '@eslint/js'
import { globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Vite react-ts 模板标准 flat config；与 oxlint 并存（pnpm lint 串行跑两者）
export default tseslint.config([
  globalIgnores(['dist', 'node_modules']),
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
  // —— AGENTS.md §5「引擎分域」执法（预防性规则，相关包当前均未安装）——
  // 一库一域，越域即违规：
  //   · GSAP → 仅品牌页（src/views/login/）与 src/effects/gsap/
  //   · WebGL 引擎（three / @react-three / pixi.js / ogl）→ 仅 src/effects/webgl/（2 期预留域）
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
                'AGENTS.md §5 引擎分域：GSAP 仅限 src/views/login/ 与 src/effects/gsap/；WebGL 引擎（three/@react-three/pixi/ogl）仅限 src/effects/webgl/；其余目录只允许 CSS + motion。',
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
                'AGENTS.md §5 引擎分域：WebGL 引擎仅限 src/effects/webgl/（2 期预留域），本目录只放行 GSAP。',
            },
          ],
        },
      ],
    },
  },
  {
    // WebGL 引擎域：effects/webgl —— 放行 three/@react-three/pixi/ogl，GSAP 仍禁
    files: ['src/effects/webgl/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['gsap'],
          patterns: [
            {
              group: ['gsap/**'],
              message:
                'AGENTS.md §5 引擎分域：GSAP 仅限 src/views/login/ 与 src/effects/gsap/，本目录为 WebGL 引擎域。',
            },
          ],
        },
      ],
    },
  },
])
