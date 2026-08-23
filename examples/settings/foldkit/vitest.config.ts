import path from 'path'
import { defineConfig } from 'vitest/config'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      'settings-core-example': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: ['settings-core-example', 'foldkit', '@foldkit/devtools'],
      },
    },
  },
})
