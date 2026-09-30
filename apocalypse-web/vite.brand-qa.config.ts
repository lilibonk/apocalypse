/** Separate brand preview fixture; normal `pnpm build` does not include it. */
import path from 'node:path'

import { defineConfig, mergeConfig } from 'vite'

import config from './vite.config'

export default mergeConfig(
  config,
  defineConfig({
    build: {
      outDir: 'dist-brand-qa',
      rollupOptions: { input: path.resolve(__dirname, 'test-fixtures/brand-slime.html') },
    },
  }),
)
