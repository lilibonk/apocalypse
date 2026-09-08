/** Explicit local-only acceptance build; normal `pnpm build` does not publish this document. */
import path from 'node:path'

import { defineConfig, mergeConfig } from 'vite'

import config from './vite.config'

export default mergeConfig(
  config,
  defineConfig({
    build: {
      outDir: 'dist-brand-qa',
      rollupOptions: { input: path.resolve(__dirname, 'docs/brand-slime/preview.html') },
    },
  }),
)
