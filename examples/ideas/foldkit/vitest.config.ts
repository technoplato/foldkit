import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: [
          'ideas-core-example',
          'foldkit',
          '@foldkit/ui',
          '@foldkit/devtools',
        ],
      },
    },
  },
})
