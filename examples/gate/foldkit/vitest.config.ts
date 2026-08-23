import path from 'path'
import { defineConfig } from 'vitest/config'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      'gate-core-example': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: ['gate-core-example', 'foldkit', '@foldkit/devtools'],
      },
    },
  },
})
