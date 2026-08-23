import path from 'path'
import { defineConfig } from 'vitest/config'

import { foldkitAliases, instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      ...instantBrowserAlias,
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: [
          'counter-core-example',
          'foldkit',
          '@foldkit/ui',
          '@foldkit/devtools',
        ],
      },
    },
  },
})
